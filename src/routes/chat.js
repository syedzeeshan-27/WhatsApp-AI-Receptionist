/**
 * chat.js — the browser chat simulator (try the bot without WhatsApp).
 *
 * The page in public/index.html talks to these endpoints. Each browser tab gets
 * a random session id; we treat it as customer "web:<id>" and run it through
 * the exact same conversation loop as WhatsApp.
 *
 * If CAL_LINK isn't set, the bot hands out a link to a fake booking page
 * (public/book.html) so the whole book → confirm → reschedule/cancel flow can
 * be tried without Cal.com.
 *
 * Turn it off in production with WEB_CHAT=off. Limits (protect your API bill
 * on a public demo): WEB_CHAT_DAILY_LIMIT total messages per day (default 300)
 * and WEB_CHAT_SESSION_LIMIT per chat session (default 30).
 */
const express = require("express");
const crypto = require("crypto");

const business = require("../config/business");
const { handleIncoming } = require("../services/conversation");
const { processBookingEvent } = require("../services/bookings");
const { takeWebMessages, WEB_PREFIX } = require("../services/messenger");
const { AI_ENABLED, MODEL } = require("../services/claude");
const store = require("../services/store");
const whatsapp = require("../services/whatsapp");

const router = express.Router();

const DAILY_LIMIT = Number(process.env.WEB_CHAT_DAILY_LIMIT) || 300;
const SESSION_LIMIT = Number(process.env.WEB_CHAT_SESSION_LIMIT) || 30;
const MAX_LENGTH = 500;

let day = new Date().toISOString().slice(0, 10);
let usedToday = 0;
const perSession = new Map();

function overLimit(sessionId) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    usedToday = 0;
    perSession.clear();
  }
  if (usedToday >= DAILY_LIMIT) return "The demo has hit its message limit for today. Try again tomorrow!";
  if ((perSession.get(sessionId) || 0) >= SESSION_LIMIT)
    return "That's the message limit for this demo chat. Refresh the page to start a new one.";
  usedToday++;
  perSession.set(sessionId, (perSession.get(sessionId) || 0) + 1);
  return null;
}

const validSession = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(s);

function baseUrl(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

function demoBookingLink(req, sessionId) {
  return business.calLink || `${baseUrl(req)}/book.html?s=${sessionId}`;
}

router.get("/info", (req, res) => {
  res.json({
    business: business.name,
    type: business.type,
    ai: AI_ENABLED ? MODEL : "offline",
    storage: store.backend,
    whatsapp: whatsapp.isConfigured,
    demoBooking: !business.calLink,
  });
});

router.post("/chat", async (req, res) => {
  const { sessionId, text } = req.body || {};
  if (!validSession(sessionId)) return res.status(400).json({ error: "Bad session id" });
  const clean = typeof text === "string" ? text.trim().slice(0, MAX_LENGTH) : "";
  if (!clean) return res.status(400).json({ error: "Empty message" });

  const limited = overLimit(sessionId);
  if (limited) return res.status(429).json({ error: limited });

  try {
    const reply = await handleIncoming({
      waId: WEB_PREFIX + sessionId,
      text: clean,
      bookingLink: demoBookingLink(req, sessionId),
    });
    res.json({ reply });
  } catch (err) {
    console.error("Web chat error:", err.message);
    res.status(500).json({ error: "Something went wrong. Check the server logs." });
  }
});

// Messages pushed to the chat outside a reply (booking confirmations).
router.get("/chat/:sessionId/inbox", (req, res) => {
  if (!validSession(req.params.sessionId)) return res.status(400).json({ error: "Bad session id" });
  res.json({ messages: takeWebMessages(WEB_PREFIX + req.params.sessionId) });
});

// The fake booking page posts here. Mirrors what a Cal.com webhook does.
router.post("/demo/book", async (req, res) => {
  if (business.calLink) return res.status(404).json({ error: "Demo booking is off (CAL_LINK is set)" });
  const { sessionId, name, startTime, timeZone, action, uid } = req.body || {};
  if (!validSession(sessionId)) return res.status(400).json({ error: "Bad session id" });
  if (action !== "cancel" && isNaN(Date.parse(startTime))) return res.status(400).json({ error: "Bad time" });

  const triggerEvent =
    action === "cancel" ? "BOOKING_CANCELLED" : action === "reschedule" ? "BOOKING_RESCHEDULED" : "BOOKING_CREATED";
  const newUid = action === "cancel" ? uid : `demo-${crypto.randomBytes(6).toString("hex")}`;
  const page = `${baseUrl(req)}/book.html?s=${sessionId}&uid=${newUid}`;

  try {
    const message = await processBookingEvent({
      triggerEvent,
      waId: WEB_PREFIX + sessionId,
      name: typeof name === "string" ? name.slice(0, 40) : undefined,
      startTime,
      timeZone: typeof timeZone === "string" ? timeZone.slice(0, 64) : undefined,
      uid: newUid,
      title: `Appointment at ${business.name}`,
      rescheduleLink: `${page}&action=reschedule`,
      cancelLink: `${page}&action=cancel`,
    });
    res.json({ ok: true, message });
  } catch (err) {
    console.error("Demo booking error:", err.message);
    res.status(500).json({ error: "Booking failed" });
  }
});

module.exports = router;
