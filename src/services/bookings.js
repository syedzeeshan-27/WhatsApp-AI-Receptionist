/**
 * bookings.js — what happens when an appointment is booked, moved or cancelled.
 *
 * Called by the Cal.com webhook (src/routes/cal.js) and by the web demo's fake
 * booking page. Stores the booking (so the bot can hand out reschedule/cancel
 * links later, only when asked) and messages the customer a confirmation.
 */
const business = require("../config/business");
const { saveBooking, deleteBooking } = require("./store");
const { send } = require("./messenger");

function formatWhen(startTime, timeZone) {
  if (!startTime) return null;
  try {
    return new Date(startTime).toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timeZone || business.timezone,
    });
  } catch {
    return startTime;
  }
}

/**
 * @param {object} e
 * @param {"BOOKING_CREATED"|"BOOKING_RESCHEDULED"|"BOOKING_CANCELLED"} e.triggerEvent
 * @param {string}  e.waId            - who to message (digits-only phone, or "web:<id>")
 * @param {string}  [e.name]          - attendee name
 * @param {string}  [e.startTime]     - ISO start time
 * @param {string}  [e.timeZone]      - attendee's timezone
 * @param {string}  [e.uid]           - booking id
 * @param {string}  [e.title]
 * @param {string}  [e.rescheduleLink]
 * @param {string}  [e.cancelLink]
 * @returns {Promise<string>} the confirmation text that was sent
 */
async function processBookingEvent(e) {
  const name = e.name || "there";
  const when = formatWhen(e.startTime, e.timeZone);
  let message;

  if (e.triggerEvent === "BOOKING_CANCELLED") {
    if (e.uid) {
      try {
        await deleteBooking(e.uid);
        console.log(`🗑️  Booking ${e.uid} removed for ${e.waId}`);
      } catch (err) {
        console.error("Could not delete cancelled booking:", err.message);
      }
    }
    message =
      `Hi ${name}! ❌ Your appointment${when ? ` for *${when}*` : ""} has been cancelled. ` +
      `If you'd like to book again, just message me here.`;
  } else {
    // New booking or reschedule. A reschedule gives a fresh uid + time, so we
    // save a new row; getLatestBooking() returns the newest one.
    // If saving fails we still send the confirmation — it's not fatal.
    if (e.uid) {
      try {
        await saveBooking({
          waId: e.waId,
          uid: e.uid,
          rescheduleLink: e.rescheduleLink || null,
          cancelLink: e.cancelLink || null,
          startTime: e.startTime || null,
          title: e.title || null,
        });
        console.log(`🗂️  Booking ${e.uid} saved for ${e.waId}`);
      } catch (err) {
        console.error("Could not save booking (sending confirmation anyway):", err.message);
      }
    } else {
      console.warn("Booking has no uid — reschedule/cancel links unavailable.");
    }

    message =
      e.triggerEvent === "BOOKING_RESCHEDULED"
        ? `Hi ${name}! 🔄 Your appointment has been moved to *${when}*. ` +
          `See you then! If you need to change it again, just message me here.`
        : `Hi ${name}! ✅ Your appointment is confirmed for *${when}*. ` +
          `See you then! If you ever need to reschedule or cancel, just message me here.`;
  }

  await send(e.waId, message);
  console.log(`📅 ${e.triggerEvent} confirmation sent to ${e.waId}`);
  return message;
}

module.exports = { processBookingEvent, formatWhen };
