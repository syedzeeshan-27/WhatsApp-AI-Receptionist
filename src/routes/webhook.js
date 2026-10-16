/**
 * webhook.js — Meta WhatsApp webhook endpoint.
 *
 * GET: verification handshake. When you click "Verify and save" in the Meta
 * dashboard, Meta sends a GET with three query params:
 *   hub.mode          -> always "subscribe"
 *   hub.verify_token  -> the token YOU typed into the dashboard
 *   hub.challenge     -> a random string Meta wants echoed back
 * We confirm the token matches WHATSAPP_VERIFY_TOKEN, then reply with the raw
 * challenge and a 200. Any mismatch gets a 403 so a stranger can't connect.
 *
 * POST: incoming messages. Meta sends a POST every time something happens on
 * your number (a message arrives, or a status like "delivered"/"read" changes).
 * Text messages go through the conversation loop and the reply is sent back.
 */
const express = require("express");
const crypto = require("crypto");

const { handleIncoming } = require("../services/conversation");
const { send } = require("../services/messenger");

const router = express.Router();

const APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";

// Meta signs every POST with your App Secret (header X-Hub-Signature-256:
// "sha256=<hex>"). Checking it stops anyone who finds your URL from faking
// messages. Optional: skipped (with a warning) if WHATSAPP_APP_SECRET is unset.
let warnedNoSecret = false;
function verifyMetaSignature(rawBody, header, secret = APP_SECRET) {
  if (!secret) {
    if (!warnedNoSecret) {
      console.warn("⚠️  WHATSAPP_APP_SECRET not set — not verifying Meta signatures.");
      warnedNoSecret = true;
    }
    return true;
  }
  if (!header || !rawBody || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice("sha256=".length));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook verified by Meta ✅");
    // Must send the raw challenge string back (not JSON) with status 200.
    return res.status(200).send(challenge);
  }

  console.warn("Webhook verification failed — bad mode or token ❌");
  return res.sendStatus(403);
});

router.post("/", async (req, res) => {
  if (!verifyMetaSignature(req.rawBody, req.get("X-Hub-Signature-256"))) {
    console.warn("WhatsApp webhook: bad signature ❌");
    return res.sendStatus(401);
  }

  // ALWAYS reply 200 right away. If we don't, Meta thinks delivery failed and
  // keeps re-sending the same event for hours. Acknowledge first, then process.
  res.sendStatus(200);

  try {
    // Meta wraps everything in entry[].changes[].value. We dig out the "value"
    // object, which holds either incoming messages OR status updates.
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    // Status updates (sent / delivered / read) arrive here too — ignore them.
    if (value?.statuses) return;

    const message = value?.messages?.[0];
    if (!message) return;

    const from = message.from; // sender's WhatsApp number, digits only
    const name = value?.contacts?.[0]?.profile?.name || "Unknown";

    // Only text for now. Images, audio, etc. are skipped.
    if (message.type !== "text") {
      console.log(`ℹ️  Ignoring non-text (${message.type}) message from ${from}`);
      return;
    }

    const text = message.text.body;
    console.log(`📩 ${name} (${from}): ${text}`);

    // message.id is WhatsApp's wamid — used to drop duplicate deliveries.
    const reply = await handleIncoming({ waId: from, text, messageId: message.id });
    if (reply === null) return; // duplicate, already answered

    console.log(`🤖 Reply: ${reply}`);
    await send(from, reply);
  } catch (err) {
    // Never let a parsing/DB error crash the server — just log it.
    console.error("Error handling incoming webhook:", err);
  }
});

module.exports = router;
module.exports.verifyMetaSignature = verifyMetaSignature;
