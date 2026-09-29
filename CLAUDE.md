# WhatsApp AI Receptionist

AI receptionist bot for small clinics.
Stack: Node/Express + Claude Haiku 4.5 + Supabase + Cal.com. Deploys on Railway.
Reusable per client by editing `src/config/business.js` + `knowledge/faq.md` + `.env`.

## Run locally
- `npm run dev`        # server on :3000, auto-reloads
- `ngrok http 3000`    # 2nd terminal; paste https URL into Meta + Cal webhooks
- Endpoints: `/health`, `/webhook` (WhatsApp), `/webhooks/cal` (Cal.com)

## Rules / gotchas
- Knowledge edits (`knowledge/faq.md`) need a server restart to take effect.
- ngrok free URL changes on every restart → re-paste into Meta AND Cal each time.
- `WHATSAPP_ACCESS_TOKEN` is a temp ~24h token; error `190` = refresh it.
- WhatsApp 24h rule: free-form messages only reach users who messaged within 24h.
- Bot must answer from `knowledge/faq.md` only — never invent hours/prices.

## Key files
- `src/routes/webhook.js`  WhatsApp in/out
- `src/routes/cal.js`      Cal.com booking webhook
- `src/services/claude.js` the brain (Claude Haiku)
- `src/services/{supabase,whatsapp}.js`  memory / sending
- `src/config/business.js` per-client persona

## Where to find more (read when relevant)
- Build status, what's verified, must-fix-before-client → `docs/STATUS.md`
- Full architecture + per-client reuse checklist → `docs/ARCHITECTURE.md`
