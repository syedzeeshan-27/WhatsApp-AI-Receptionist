# WhatsApp AI Receptionist

Open-source AI receptionist bot for small clinics. Public repo: strangers clone it,
so nothing may depend on one person's accounts, numbers or keys.
Stack: Node/Express + Claude (Haiku 4.5 default) + Supabase (optional) + Cal.com (optional).
Reusable per client by editing `src/config/business.js` + `knowledge/faq.md` + `.env`.

## Run locally
- `npm install`, then `npm run dev`  → http://localhost:3000 (browser chat demo)
- Works with NO .env at all: offline keyword replies, in-memory storage, fake booking page.
- `npm test` runs fully offline (it blanks real keys first).
- For real WhatsApp: `ngrok http 3000`, paste the https URL + `/webhook` into Meta, `/webhooks/cal` into Cal.com.

## Rules / gotchas
- Knowledge edits (`knowledge/faq.md`) need a server restart to take effect.
- Bot must answer from `knowledge/faq.md` only — never invent hours/prices.
- Customer ids starting with `web:` are browser-chat users; everything else is a WhatsApp number.
- Temporary Meta access tokens die after ~24h (error `190`); real deploys need a System User token.
- WhatsApp 24h rule: free-form messages only reach users who messaged within 24h.
- Never commit `.env`. Keep personal data (real numbers, Cal links, Supabase URLs) out of tracked files.

## Key files
See `docs/ARCHITECTURE.md` for the map. Entry: `src/index.js`. Core loop: `src/services/conversation.js`.

## Lessons learned (do not repeat)
- Stop test servers by their own PID/port only. Never `taskkill /IM node.exe`: it kills other sessions' Node processes too.
- `node --test test/` fails on Node 22 (treats the dir as a module). Use plain `node --test`.
- `python -I` hides user-site packages (Playwright lives there); only use `-I` for scripts that read untrusted downloads.
