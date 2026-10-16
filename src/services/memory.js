/**
 * memory.js — in-memory stand-in for the Supabase store.
 *
 * Used automatically when SUPABASE_URL isn't set, so the bot runs with zero
 * database setup (local testing, the web chat demo). Same function signatures
 * as supabase.js. Everything is lost when the server restarts.
 */
let nextId = 1;
const conversations = []; // { id, wa_id, role, content, wa_message_id, created_at }
const bookings = []; // { id, wa_id, uid, reschedule_link, cancel_link, start_time, title, created_at }

// Cap total stored messages so a long-running public demo can't eat all RAM.
const MAX_MESSAGES = 5000;

async function saveMessage({ waId, role, content, waMessageId = null }) {
  if (waMessageId && conversations.some((m) => m.wa_message_id === waMessageId)) {
    console.log("↩️  Duplicate message — already saved, skipping.");
    return null;
  }
  const row = {
    id: nextId++,
    wa_id: waId,
    role,
    content,
    wa_message_id: waMessageId,
    created_at: new Date().toISOString(),
  };
  conversations.push(row);
  if (conversations.length > MAX_MESSAGES) conversations.shift();
  return row;
}

async function getHistory(waId, limit = 20) {
  return conversations
    .filter((m) => m.wa_id === waId)
    .slice(-limit)
    .map(({ role, content, created_at }) => ({ role, content, created_at }));
}

async function saveBooking({ waId, uid, rescheduleLink = null, cancelLink = null, startTime = null, title = null }) {
  const row = {
    id: nextId++,
    wa_id: waId,
    uid,
    reschedule_link: rescheduleLink,
    cancel_link: cancelLink,
    start_time: startTime,
    title,
    created_at: new Date().toISOString(),
  };
  bookings.push(row);
  return row;
}

async function getLatestBooking(waId) {
  for (let i = bookings.length - 1; i >= 0; i--) {
    if (bookings[i].wa_id === waId) {
      const { uid, reschedule_link, cancel_link, start_time, title } = bookings[i];
      return { uid, reschedule_link, cancel_link, start_time, title };
    }
  }
  return null;
}

async function deleteBooking(uid) {
  for (let i = bookings.length - 1; i >= 0; i--) {
    if (bookings[i].uid === uid) bookings.splice(i, 1);
  }
}

module.exports = { saveMessage, getHistory, saveBooking, getLatestBooking, deleteBooking };
