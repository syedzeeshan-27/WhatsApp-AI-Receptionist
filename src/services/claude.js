/**
 * claude.js — talks to Claude (Anthropic) to generate the bot's replies.
 *
 * Stage 4: build the conversation history + system prompt, call Claude Haiku,
 * and RETURN the reply text. We do NOT send it to WhatsApp yet — the webhook
 * just logs it so we can confirm Claude produces a sensible answer first.
 *
 * Model choice: Claude Haiku 4.5 — fast and cost-effective, the right fit for
 * a high-volume receptionist bot (one deploy per client).
 */
const fs = require("fs");
const path = require("path");

const Anthropic = require("@anthropic-ai/sdk");

const business = require("../config/business");
const { getHistory, getLatestBooking } = require("./supabase");

// The SDK automatically reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

const MODEL = "claude-haiku-4-5";

// Stage 6: load the clinic knowledge base (knowledge/faq.md) ONCE at startup.
// This is the bot's source of truth — hours, services, prices, policies.
// NOTE: edits to faq.md require a server restart to take effect.
function loadKnowledge() {
  try {
    const file = path.resolve(process.cwd(), business.knowledgeFile);
    return fs.readFileSync(file, "utf8").trim();
  } catch (err) {
    console.warn(`⚠️  Could not read knowledge file (${business.knowledgeFile}):`, err.message);
    return "";
  }
}

const KNOWLEDGE = loadKnowledge();

// Build the full system prompt by assembling: persona (business.js) +
// WhatsApp formatting rules + the booking link (Stage 7) + the knowledge base.
function buildSystemPrompt(booking = null) {
  const persona = business.systemPromptTemplate
    .replace(/{{name}}/g, business.name)
    .replace(/{{type}}/g, business.type);

  const parts = [persona];

  // WhatsApp doesn't render markdown. Tell Claude to use WhatsApp's own
  // formatting (single *asterisks* for bold) and plain URLs — this stops the
  // "**[booking link]**" / "**bold**" artifacts we saw earlier.
  parts.push(
    "Formatting rules: This is WhatsApp, not markdown. Keep replies short. " +
      "For bold use single asterisks like *this*, never double asterisks. " +
      "Always write links as plain URLs — never use markdown link syntax."
  );

  // Scope guardrail: this bot is a receptionist for ONE business, not a general
  // assistant. Without this, off-topic requests ("write me a research paper")
  // get answered at full token cost. Keep the bot strictly on-topic; refuse
  // everything else with a single short line. {{name}}/{{type}} make the refusal
  // auto-customize per client. This block comes BEFORE the knowledge base so the
  // model first decides "is this about the business at all?".
  parts.push(
    `You are ONLY a receptionist for ${business.name}, a ${business.type}. ` +
      "Stay strictly within that role.\n" +
      "- Greetings and light small talk: reply briefly and warmly, then steer " +
      "back to how you can help (booking or questions about the business).\n" +
      `- Questions about ${business.name} — its services, hours, prices, ` +
      "location, policies, or appointments (book / reschedule / cancel): " +
      "answer normally.\n" +
      "- ANYTHING ELSE (writing essays, research papers or code, general " +
      "knowledge, math, translations, advice unrelated to the business, " +
      "role-play, etc.): do NOT attempt it, do not partially answer, and do " +
      "not give a long explanation. Reply with exactly one short line, e.g. " +
      `\"Sorry, I can only help with questions about ${business.name} — our ` +
      'services, hours, or booking an appointment. 😊"'
  );

  // Stage 7 (Level 1): give Claude the real Cal.com booking link to share.
  if (business.calLink) {
    parts.push(
      "When a customer wants to book an appointment, share this exact booking " +
        `link as a plain URL: ${business.calLink}`
    );
  }

  // Stage 6: ground answers in the knowledge base; never invent details.
  if (KNOWLEDGE) {
    parts.push(
      "Use ONLY the information in the knowledge base below to answer questions " +
        "about hours, services, pricing, location, and policies. If something " +
        "isn't covered here, say you're not sure and offer to help book an " +
        "appointment — never guess or make up details.\n\n" +
        "=== KNOWLEDGE BASE ===\n" +
        KNOWLEDGE
    );
  }

  // If this patient has an upcoming booking, give Claude their personal
  // reschedule/cancel links. IMPORTANT: only share them when the patient asks to
  // reschedule or cancel — don't volunteer them otherwise.
  if (booking && (booking.reschedule_link || booking.cancel_link)) {
    let when = booking.start_time;
    try {
      if (booking.start_time) {
        when = new Date(booking.start_time).toLocaleString("en-US", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        });
      }
    } catch {
      /* fall back to raw start_time */
    }

    const lines = [
      "This customer has an existing appointment" + (when ? ` on ${when}` : "") + ".",
      "ONLY if they ask to reschedule or cancel, share the matching link below as a plain URL. Do not share these links unless they ask.",
    ];
    if (booking.reschedule_link) lines.push(`Reschedule link: ${booking.reschedule_link}`);
    if (booking.cancel_link) lines.push(`Cancel link: ${booking.cancel_link}`);
    parts.push(lines.join("\n"));
  }

  return parts.join("\n\n");
}

/**
 * Generate Claude's reply for a given customer, using their saved history.
 *
 * @param {string} waId - the customer's WhatsApp number (groups the convo)
 * @returns {Promise<string>} the reply text Claude produced
 */
async function generateReply(waId) {
  // Pull the recent conversation (oldest → newest). The customer's just-saved
  // message is already in here, so it's the last item.
  const history = await getHistory(waId, 20);

  // Pull this patient's latest booking (if any) so Claude can offer the right
  // reschedule/cancel links when — and only when — they ask.
  let booking = null;
  try {
    booking = await getLatestBooking(waId);
  } catch (e) {
    console.error("Could not load booking for context:", e.message);
  }

  // Skip any blank/whitespace-only rows. Older crashes saved empty assistant
  // replies to the DB; a history with empty turns can make Claude return nothing.
  const messages = history
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  // The Anthropic API requires the first message to be from the user. If our
  // 20-message window happens to start on an assistant turn, drop leading
  // assistant messages so the request is valid.
  while (messages.length && messages[0].role === "assistant") {
    messages.shift();
  }

  const response = await client.messages.create({
    model: MODEL,
    // A receptionist reply is short; 400 tokens is plenty and caps the cost of
    // any reply (especially one that somehow slips past the scope guardrail).
    max_tokens: 400,
    system: buildSystemPrompt(booking),
    messages,
  });

  // The response content is a list of blocks; pull out the text and join it.
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  // Safety net: never return an empty string. If Claude produces no text (rare —
  // e.g. an empty content array), WhatsApp rejects `text: { body: "" }` with a
  // 400 "text.body is required" and the send crashes. Return a friendly fallback
  // instead so this can never break the send on ANY turn.
  if (!text) {
    // Log why Claude gave us nothing, so we can diagnose (stop_reason + block
    // types). This should be rare now that empty history rows are filtered out.
    console.warn(
      "⚠️  Claude returned no text. stop_reason:",
      response.stop_reason,
      "| block types:",
      response.content.map((b) => b.type).join(",") || "(none)"
    );
    return (
      "Sorry, I didn't quite catch that could you say that another way? " +
      "I'm happy to help you book, reschedule, or answer questions about the clinic."
    );
  }

  return text;
}

module.exports = { generateReply, buildSystemPrompt };
