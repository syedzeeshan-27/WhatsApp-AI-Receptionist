/**
 * messenger.js — one place to "send a message to a customer", whatever channel
 * they're on.
 *
 * Customer ids that start with "web:" belong to the browser chat simulator:
 * their messages are queued in memory and picked up by the page (it polls).
 * Everything else is a real WhatsApp number and goes out through Meta.
 */
const whatsapp = require("./whatsapp");

const WEB_PREFIX = "web:";
const webInbox = new Map(); // waId -> [{ text, at }]

function isWebUser(waId) {
  return String(waId).startsWith(WEB_PREFIX);
}

async function send(to, text) {
  if (isWebUser(to)) {
    const queue = webInbox.get(to) || [];
    queue.push({ text, at: new Date().toISOString() });
    webInbox.set(to, queue.slice(-20));
    return;
  }
  return whatsapp.sendMessage(to, text);
}

// Return and clear any messages waiting for a web chat session.
function takeWebMessages(waId) {
  const queue = webInbox.get(waId) || [];
  webInbox.delete(waId);
  return queue;
}

module.exports = { send, takeWebMessages, isWebUser, WEB_PREFIX };
