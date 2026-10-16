/**
 * conversation.js — the core loop, shared by WhatsApp and the web chat:
 * save the customer's message → ask Claude → save the reply → return it.
 */
const { saveMessage } = require("./store");
const { generateReply } = require("./claude");

/**
 * @param {object} msg
 * @param {string} msg.waId          - customer id (WhatsApp number or "web:<id>")
 * @param {string} msg.text          - what they wrote
 * @param {string} [msg.messageId]   - WhatsApp message id, used to drop duplicate deliveries
 * @param {string} [msg.bookingLink] - booking link override (web demo)
 * @returns {Promise<string|null>} the reply, or null if this was a duplicate
 */
async function handleIncoming({ waId, text, messageId = null, bookingLink }) {
  const saved = await saveMessage({ waId, role: "user", content: text, waMessageId: messageId });

  // Meta sometimes delivers the same message twice. If we've seen it already,
  // stop here — otherwise the customer gets two replies.
  if (!saved) return null;

  const reply = await generateReply(waId, bookingLink ? { bookingLink } : undefined);
  await saveMessage({ waId, role: "assistant", content: reply });
  return reply;
}

module.exports = { handleIncoming };
