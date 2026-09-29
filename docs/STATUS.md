# Build Status & Known Issues

Built in verified stages, one at a time.

## ✅ Confirmed working (verified live)

| Stage | What it does | Status |
|------|--------------|--------|
| 0 — Scaffold | Folder structure, deps, `/health` endpoint | ✅ verified |
| 1 — Webhook verify | Meta webhook GET handshake (`WHATSAPP_VERIFY_TOKEN`) | ✅ verified (Meta green check) |
| 2 — Inbound logging | POST handler receives + parses incoming WhatsApp messages | ✅ verified (msg logged) |
| 3 — Supabase | Saves every message to `conversations` table | ✅ verified (row appears) |
| 4 — Claude reply (no send) | Builds prompt + history, calls Haiku, logs reply | ✅ verified (sensible reply) |
| 5 — Send reply | Full loop: in → save → Claude → save → send back on WhatsApp | ✅ verified (live 2-way chat) |
| 6 — Knowledge/FAQ | Injects `knowledge/faq.md`; answers from it, won't invent | ✅ verified (real hours; declined off-menu) |
| 7 — Cal.com booking (Level 1) | Bot shares real booking link; patient books on Cal | ✅ verified (booked + email + Cal entry) |
| 7 — Cal.com booking (Level 2) | Cal webhook → WhatsApp booking confirmation | ✅ verified (live confirmation: "Hi Shaaann! Your appointment is confirmed for Mon, June 8, 2026 at 2:00 PM") |
| 7 — Reschedule / cancel (Level 3) | Bot shares per-patient reschedule/cancel links on request (stored in new `bookings` table); Cal `BOOKING_CANCELLED`/`BOOKING_RESCHEDULED` webhooks → WhatsApp confirmation. Plus empty-reply crash guard. | ✅ verified live (links delivered on WhatsApp + email; cancel/reschedule notifications arrive on both WhatsApp and email) |

## 🔜 Remaining
- **8 — Polish/testing** — add prompt caching (cost), edge cases
- **9 — Railway deploy** — run 24/7, no laptop + ngrok
- See **⚠️ Known issues / must-fix before client** below for blockers.

## ⚠️ Known issues / must-fix before giving to a client
These are deferred for now (we'll move on with build stages and fix these later), but **every one of these must be resolved before a real client deploy:**

- **🔴 `WHATSAPP_ACCESS_TOKEN` is a temp token that expires ~24h.** It will keep dying every day (error `190`). **Must replace with a permanent System User token** (never expires) in Meta Business Settings before deploy. One-time ~5-min setup.
- **🟡 WhatsApp 24h rule.** Free-form messages only reach someone who messaged the bot within 24h. The booking confirmation works today *because* the patient just chatted. A patient who books on the web **without ever chatting** won't get a confirmation — that requires an approved WhatsApp message template. Needed for a real chat→web→book flow.
- **🟡 ngrok URL is temporary.** Changes on every restart and must be re-pasted into both Meta and Cal webhooks. Goes away once deployed to Railway (Stage 9).
