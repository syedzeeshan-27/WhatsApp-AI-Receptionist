/**
 * cal.js — Cal.com booking webhook.
 *
 * When a patient books, cancels, or reschedules on your Cal.com page, Cal sends
 * a POST here. We verify the signature, pull out who + when + their phone number,
 * and hand it to services/bookings.js, which stores the booking and sends the
 * WhatsApp confirmation.
 *
 * Heads-up on WhatsApp's 24-hour rule: free-form messages can only be sent to
 * someone who messaged your number within the last 24h. So a confirmation works
 * for patients who booked *through the chat* (the common case). Reaching a
 * brand-new number later requires an approved message template (not built yet).
 */
const express = require("express");
const crypto = require("crypto");

const { processBookingEvent } = require("../services/bookings");

const router = express.Router();

const SECRET = process.env.CAL_WEBHOOK_SECRET || "";

// Base URL for reschedule/cancel links. Change it if you self-host Cal.com.
const CAL_BASE_URL = (process.env.CAL_BASE_URL || "https://cal.com").replace(/\/+$/, "");

const HANDLED = ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"];

// Verify Cal's HMAC-SHA256 signature over the raw request body.
function verifySignature(rawBody, signature, secret = SECRET) {
  if (!secret) {
    console.warn("⚠️  CAL_WEBHOOK_SECRET not set — skipping signature check.");
    return true;
  }
  if (!signature || !rawBody) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

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
    // Count digits after stripping spaces, dashes and brackets, so a number
    // typed as "+44 7700 900123" still counts. Phone numbers are 7–15 digits.
    const digits = c ? String(c).replace(/\D/g, "") : "";
    if (digits.length >= 7 && digits.length <= 15) return digits;
  }
  return null;
}

router.post("/", async (req, res) => {
  // Reject forged requests.
  if (!verifySignature(req.rawBody, req.get("X-Cal-Signature-256"))) {
    console.warn("Cal webhook: bad signature ❌");
    return res.sendStatus(401);
  }

  // Acknowledge immediately so Cal doesn't retry.
  res.sendStatus(200);

  try {
    const { triggerEvent, payload } = req.body || {};

    // Anything other than book / cancel / reschedule (e.g. meeting-ended) is ignored.
    if (!HANDLED.includes(triggerEvent)) return;

    const phone = extractPhone(payload);
    if (!phone) {
      console.warn(
        `Cal webhook: ${triggerEvent} received but no phone number found — ` +
          "can't send a WhatsApp message. (Add a phone field to the event.)"
      );
      return;
    }

    // Cal puts reschedule/cancel links in its email; we derive the same links
    // from the booking `uid` so the bot can hand them over later in chat.
    const uid = payload?.uid || payload?.bookingId || null;

    await processBookingEvent({
      triggerEvent,
      waId: phone,
      name: payload?.attendees?.[0]?.name || payload?.responses?.name?.value,
      startTime: payload?.startTime,
      timeZone: payload?.attendees?.[0]?.timeZone,
      uid,
      title: payload?.title,
      rescheduleLink: uid ? `${CAL_BASE_URL}/reschedule/${uid}` : null,
      cancelLink: uid ? `${CAL_BASE_URL}/booking/${uid}?cancel=true` : null,
    });
  } catch (err) {
    console.error("Cal webhook error:", err);
  }
});

module.exports = router;
module.exports.verifySignature = verifySignature;
module.exports.extractPhone = extractPhone;
