/**
 * supabase.js — our single connection to the Supabase database.
 *
 * Everything that reads or writes the `conversations` table goes through the
 * two helpers here, so the rest of the app never touches SQL directly.
 *
 * We use the SERVICE_ROLE key (server-side only — it bypasses Row Level
 * Security). This is safe because this code never runs in a browser.
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  // We're a stateless server — no need to persist login sessions to disk.
  { auth: { persistSession: false } }
);

/**
 * Save one message (incoming or outgoing) to the conversations table.
 *
 * @param {object}  msg
 * @param {string}  msg.waId         - the customer's WhatsApp number
 * @param {string}  msg.role         - 'user' (customer) or 'assistant' (bot)
 * @param {string}  msg.content      - the message text
 * @param {string} [msg.waMessageId] - WhatsApp's message id (inbound only; used for dedup)
 * @returns {Promise<object|null>} the saved row, or null if it was a duplicate
 */
async function saveMessage({ waId, role, content, waMessageId = null }) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      wa_id: waId,
      role,
      content,
      wa_message_id: waMessageId,
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique-constraint violation. That means we've already saved this
    // exact WhatsApp message (Meta sometimes delivers the same event twice).
    // Not a real error — just skip it.
    if (error.code === "23505") {
      console.log("↩️  Duplicate message — already saved, skipping.");
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Fetch a customer's recent messages, oldest → newest.
 * Not used until Stage 4 (building history for Claude), but wired now so the
 * data layer is complete.
 *
 * @param {string} waId    - the customer's WhatsApp number
 * @param {number} [limit] - max messages to return (default 20)
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
async function getHistory(waId, limit = 20) {
  const { data, error } = await supabase
    .from("conversations")
    .select("role, content, created_at")
    .eq("wa_id", waId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Save a booking when Cal.com tells us one was created. Keyed by the patient's
 * phone so we can hand them their reschedule/cancel links later, only when they
 * ask. Stored separately from messages so the data stays clean.
 *
 * @param {object}  b
 * @param {string}  b.waId           - the patient's WhatsApp number (digits only)
 * @param {string}  b.uid            - Cal's unique booking id
 * @param {string} [b.rescheduleLink]
 * @param {string} [b.cancelLink]
 * @param {string} [b.startTime]     - ISO start time from Cal
 * @param {string} [b.title]         - event title
 * @returns {Promise<object>} the saved row
 */
async function saveBooking({ waId, uid, rescheduleLink = null, cancelLink = null, startTime = null, title = null }) {
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      wa_id: waId,
      uid,
      reschedule_link: rescheduleLink,
      cancel_link: cancelLink,
      start_time: startTime,
      title,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get a patient's most recent booking (by phone), or null if they have none.
 * Used to give the bot the patient's reschedule/cancel links in context.
 *
 * @param {string} waId - the patient's WhatsApp number
 * @returns {Promise<object|null>}
 */
async function getLatestBooking(waId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("uid, reschedule_link, cancel_link, start_time, title")
    .eq("wa_id", waId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data && data.length ? data[0] : null;
}

/**
 * Remove a booking by its Cal uid — used when a patient cancels, so the bot
 * won't later offer a reschedule/cancel link for an appointment that's gone.
 *
 * @param {string} uid - Cal's unique booking id
 * @returns {Promise<void>}
 */
async function deleteBooking(uid) {
  const { error } = await supabase.from("bookings").delete().eq("uid", uid);
  if (error) throw error;
}

module.exports = {
  supabase,
  saveMessage,
  getHistory,
  saveBooking,
  getLatestBooking,
  deleteBooking,
};
