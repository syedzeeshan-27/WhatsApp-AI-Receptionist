# Architecture

```
WhatsApp user ─▶ Meta Cloud API ─▶ POST /webhook ─┐
                                                  │
Browser user ──▶ public/index.html ─▶ POST /api/chat ─┤
                                                  ▼
                                  services/conversation.js
                                  save message → ask Claude → save reply
                                        │              │
                         services/store.js       services/claude.js
                         Supabase or memory      system prompt + FAQ + history
                                                       │
                                            Claude API, or offline.js
                                            (keyword fallback, no key)

Cal.com ─▶ POST /webhooks/cal ─┐
Demo page ─▶ POST /api/demo/book ─┤
                                  ▼
                        services/bookings.js ─▶ services/messenger.js
                        store booking,            "web:*" ids → browser inbox
                        build confirmation        phone numbers → WhatsApp
```

## Files

| File | What it does |
|---|---|
| `src/index.js` | Express app, mounts everything, prints which mode it's in |
| `src/routes/webhook.js` | Meta webhook: verification handshake, signature check, incoming messages |
| `src/routes/cal.js` | Cal.com webhook: signature check, finds the phone number, hands off to bookings |
| `src/routes/chat.js` | Browser chat API, fake booking endpoint, rate limits |
| `src/services/conversation.js` | The core loop shared by WhatsApp and the browser |
| `src/services/claude.js` | Builds the prompt (persona, scope rules, booking link, FAQ, customer's booking) and calls Claude |
| `src/services/offline.js` | No-key fallback: matches keywords to FAQ sections |
| `src/services/store.js` | Picks Supabase or in-memory storage |
| `src/services/bookings.js` | Saves/deletes bookings and sends the confirmation text |
| `src/services/messenger.js` | Sends to WhatsApp, or queues for the browser chat |
| `src/config/business.js` | Business name, type, persona, timezone |
| `knowledge/faq.md` | Everything the bot is allowed to say about the business |

## Setting it up for a different business

1. Edit `src/config/business.js` (name, type, persona).
2. Replace `knowledge/faq.md` (start from `knowledge/TEMPLATE.md`).
3. Set `.env`: Anthropic key, WhatsApp credentials, Supabase, `CAL_LINK`, `TIMEZONE`, `WEB_CHAT=off`.
4. Point the Meta and Cal.com webhooks at the deployed URL.

One deploy per business keeps each client's data and prompt separate.
