/**
 * cal.js — Cal.com booking webhook (Stage 7, Level 2).
 *
 * When a patient books, cancels, or reschedules on your Cal.com page, Cal sends
 * a POST here. We verify the signature, pull out who + when + their phone number,
 * and fire the matching WhatsApp confirmation back to them. We also keep a record
 * of the booking (uid + reschedule/cancel links) so the bot can share those links
 * later in chat — only when the patient asks.
 *
 * Heads-up on WhatsApp's 24-hour rule: free-form messages can only be sent to
 * someone who messaged your number within the last 24h. So a confirmation works
 * for patients who booked *through the chat* (the common case). Reaching a
 * brand-new number later requires an approved message template (a future step).
 */
const express = require("express");
const crypto = require("crypto");

const { sendMessage } = require("../services/whatsapp");
const { saveBooking, deleteBooking } = require("../services/supabase");

const router = express.Router();

const SECRET = process.env.CAL_WEBHOOK_SECRET || "";

// Verify Cal's HMAC-SHA256 signature over the raw request body.
function verifySignature(req) {
  if (!SECRET) {
    console.warn("⚠️  CAL_WEBHOOK_SECRET not set — skipping signature check.");
    return true;
  }
  const signature = req.get("X-Cal-Signature-256");
  if (!signature || !req.rawBody) return false;

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(req.rawBody)
    .digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Cal puts the booker's phone in different spots depending on how the event is
// configured (phone-number location, a phone booking question, SMS reminder).
// Check the likely places and return digits-only (WhatsApp wants no "+").
function extractPhone(payload) {
  const responses = payload?.responses || {};
  const candidates = [
    payload?.attendees?.[0]?.phoneNumber,
    responses.phone?.value,
    responses.attendeePhoneNumber?.value,
    responses.smsReminderNumber?.value,
    typeof responses.location?.value === "string"
      ? responses.location.value
      : responses.location?.value?.optionValue,
  ];
  for (const c of candidates) {
    if (c && /\d{6,}/.test(String(c))) return String(c).replace(/\D/g, "");
  }
  return null;
}

router.post("/", async (req, res) => {
  // Reject forged requests.
  if (!verifySignature(req)) {
    console.warn("Cal webhook: bad signature ❌");
    return res.sendStatus(401);
  }

  // Acknowledge immediately so Cal doesn't retry.
  res.sendStatus(200);

  try {
    const { triggerEvent, payload } = req.body || {};

    // We handle three Cal events: a new booking, a cancellation, and a
    // reschedule. Anything else (e.g. meeting-ended) we ignore.
    const HANDLED = ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"];
    if (!HANDLED.includes(triggerEvent)) return;

    const name =
      payload?.attendees?.[0]?.name || payload?.responses?.name?.value || "there";
    const phone = extractPhone(payload);

    // Format the start time in the booker's timezone (shared by all events).
    let when = payload?.startTime;
    try {
      when = new Date(payload.startTime).toLocaleString("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: payload?.attendees?.[0]?.timeZone || "Asia/Kolkata",
      });
    } catch {
      /* fall back to raw startTime */
    }

    if (!phone) {
      console.warn(
        `Cal webhook: ${triggerEvent} received but no phone number found — ` +
          "can't send a WhatsApp message. (Add a phone field to the event.)"
      );
      return;
    }

    // Build the reschedule/cancel links from the booking's unique id. Cal puts
    // these same links in its email; we derive them from the `uid` so we can
    // hand them to the patient later — only when they ask in chat.
    const uid = payload?.uid || payload?.bookingId || null;
    const rescheduleLink = uid ? `https://cal.com/reschedule/${uid}` : null;
    const cancelLink = uid ? `https://cal.com/booking/${uid}?cancel=true` : null;

    // --- Cancellation ---------------------------------------------------------
    if (triggerEvent === "BOOKING_CANCELLED") {
      if (uid) {
        try {
          await deleteBooking(uid);
          console.log(`🗑️  Booking ${uid} removed for ${phone}`);
        } catch (e) {
          console.error("Could not delete cancelled booking:", e.message);
        }
      }
      const message =
        `Hi ${name}! ❌ Your appointment${when ? ` for *${when}*` : ""} has been cancelled. ` +
        `If you'd like to book again, just message me here.`;
      await sendMessage(phone, message);
      console.log(`📅 Cancellation confirmation sent to ${phone}`);
      return;
    }

    // --- Reschedule -----------------------------------------------------------
    if (triggerEvent === "BOOKING_RESCHEDULED") {
      // A reschedule gives Cal a fresh uid + time, so the old links go stale.
      // Save the new booking; getLatestBooking() will return this newest row.
      if (uid) {
        try {
          await saveBooking({
            waId: phone,
            uid,
            rescheduleLink,
            cancelLink,
            startTime: payload?.startTime || null,
            title: payload?.title || null,
          });
          console.log(`🔄 Booking updated to ${uid} for ${phone}`);
        } catch (e) {
          console.error("Could not update rescheduled booking:", e.message);
        }
      }
      const message =
        `Hi ${name}! 🔄 Your appointment has been moved to *${when}*. ` +
        `See you then! If you need to change it again, just message me here.`;
      await sendMessage(phone, message);
      console.log(`📅 Reschedule confirmation sent to ${phone}`);
      return;
    }

    // --- New booking (BOOKING_CREATED) ---------------------------------------
    // Remember this booking (keyed by phone) so the bot can share the links on
    // request. If saving fails, we still send the confirmation — it's not fatal.
    if (uid) {
      try {
        await saveBooking({
          waId: phone,
          uid,
          rescheduleLink,
          cancelLink,
          startTime: payload?.startTime || null,
          title: payload?.title || null,
        });
        console.log(`🗂️  Booking ${uid} saved for ${phone}`);
      } catch (e) {
        console.error("Could not save booking (sending confirmation anyway):", e.message);
      }
    } else {
      console.warn("Cal webhook: no booking uid in payload — reschedule links unavailable.");
    }

    const message =
      `Hi ${name}! ✅ Your appointment is confirmed for *${when}*. ` +
      `See you then! If you ever need to reschedule or cancel, just message me here.`;

    await sendMessage(phone, message);
    console.log(`📅 Booking confirmation sent to ${phone}`);
  } catch (err) {
    console.error("Cal webhook error:", err);
  }
});

module.exports = router;
