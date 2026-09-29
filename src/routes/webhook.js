/**
 * webhook.js — Meta WhatsApp webhook endpoint.
 *
 * Stage 1: GET verification handshake only.
 * When you click "Verify and save" in the Meta dashboard, Meta sends a GET
 * request to this URL with three query params:
 *   hub.mode          -> always "subscribe"
 *   hub.verify_token  -> the token YOU typed into the dashboard
 *   hub.challenge     -> a random string Meta wants echoed back
 *
 * We confirm the token matches our WHATSAPP_VERIFY_TOKEN, then reply with the
 * raw challenge and a 200. Any mismatch gets a 403 so a stranger can't connect.
 *
 * Stage 2: POST handler (incoming messages).
 * Meta sends a POST to this URL every time something happens on your number
 * (a message arrives, or a status like "delivered"/"read" changes). For now we
 * just LOG real text messages so we can confirm they're reaching the server.
 * Replying with AI comes in a later stage.
 */
const express = require("express");

const { saveMessage } = require("../services/supabase");
const { generateReply } = require("../services/claude");
const { sendMessage } = require("../services/whatsapp");

const router = express.Router();

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook verified by Meta ✅");
    // Must send the raw challenge string back (not JSON) with status 200.
    return res.status(200).send(challenge);
  }

  console.warn("Webhook verification failed — bad mode or token ❌");
  return res.sendStatus(403);
});

router.post("/", async (req, res) => {
  // ALWAYS reply 200 right away. If we don't, Meta thinks delivery failed and
  // keeps re-sending the same event for hours. Acknowledge first, then process.
  res.sendStatus(200);

  try {
    // Meta wraps everything in entry[].changes[].value. We dig out the "value"
    // object, which holds either incoming messages OR status updates.
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    // Status updates (sent / delivered / read) arrive here too — ignore them
    // for now so the log stays clean and only shows real incoming messages.
    if (value?.statuses) {
      return;
    }

    const message = value?.messages?.[0];
    if (!message) {
      // Some other event we don't care about yet — quietly skip.
      return;
    }

    const from = message.from; // sender's WhatsApp number (e.g. 9198...)
    const name = value?.contacts?.[0]?.profile?.name || "Unknown";

    // For now we only handle text. Skip non-text (images, audio, etc.) so we
    // don't save junk — we'll support more types in a later stage.
    if (message.type !== "text") {
      console.log(`ℹ️  Ignoring non-text (${message.type}) message from ${from}`);
      return;
    }

    const text = message.text.body;

    console.log("📩 Incoming WhatsApp message");
    console.log(`   From: ${name} (${from})`);
    console.log(`   Text: ${text}`);

    // Stage 3: save the customer's message to the database.
    // message.id is WhatsApp's wamid… — passed as waMessageId so duplicate
    // deliveries are ignored by the unique index.
    await saveMessage({
      waId: from,
      role: "user",
      content: text,
      waMessageId: message.id,
    });
    console.log("💾 Saved to conversations table.");

    // Ask Claude for a reply.
    const reply = await generateReply(from);
    console.log("🤖 Claude's reply:");
    console.log(`   ${reply}`);

    // Stage 5: save the bot's reply (so it remembers what it said) and send it
    // back to the customer on WhatsApp. This completes the full loop.
    await saveMessage({ waId: from, role: "assistant", content: reply });
    await sendMessage(from, reply);
    console.log("📤 Reply sent to user on WhatsApp.");
  } catch (err) {
    // Never let a parsing/DB error crash the server — just log it.
    console.error("Error handling incoming webhook:", err);
  }
});

module.exports = router;
