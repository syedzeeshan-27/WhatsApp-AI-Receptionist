/**
 * business.js — ALL business-specific content lives here.
 *
 * To set up the bot for a new client, you only edit THIS file (plus the
 * knowledge file and the .env values). No other code changes are needed.
 *
 * "Bright Smile Dental" is a made-up example clinic used by the demo.
 */
module.exports = {
  // Display name of the business
  name: "Bright Smile Dental",

  // Used to set the bot's role/tone (e.g. "dental clinic", "salon", "law firm")
  type: "dental clinic",

  // Public Cal.com booking link the bot sends when a patient wants to book.
  // Mirrors CAL_LINK in .env; kept here so config stays in one place.
  calLink: process.env.CAL_LINK || "",

  // Timezone used when telling patients their appointment time (IANA name,
  // e.g. "America/New_York", "Europe/London", "Asia/Kolkata").
  timezone: process.env.TIMEZONE || "UTC",

  // Path (relative to project root) to the knowledge/FAQ file the bot reads.
  knowledgeFile: "knowledge/faq.md",

  // The persona/instructions for the assistant — TONE and ROLE only.
  // Scope rules (what to answer vs refuse) and grounding live centrally in
  // src/services/claude.js, so every client inherits them automatically.
  // {{type}} and {{name}} are placeholders the Claude service fills in.
  systemPromptTemplate:
    "You are a friendly, concise receptionist for {{name}}, a {{type}}. " +
    "Keep replies short and WhatsApp-friendly.",
};
