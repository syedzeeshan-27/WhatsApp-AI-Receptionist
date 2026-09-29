# Architecture & Per-Client Reuse

## Architecture
```
Phone ⇄ Meta Cloud API ⇄ ngrok ⇄ Express server
                                      ├─ src/routes/webhook.js   (WhatsApp in/out)
                                      ├─ src/routes/cal.js       (Cal.com booking webhook)
                                      ├─ src/services/claude.js  (Claude Haiku — the brain)
                                      ├─ src/services/supabase.js(conversation memory)
                                      ├─ src/services/whatsapp.js(send via Graph API)
                                      ├─ src/config/business.js  (per-client persona/config)
                                      └─ knowledge/faq.md        (per-client facts)
```

## Environment (.env) — key names that matter
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN` (temp ~24h!), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `ANTHROPIC_API_KEY` (SDK reads this automatically)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `CAL_LINK` (public booking link), `CAL_WEBHOOK_SECRET`

## Per-client reuse checklist (one deploy per clinic)
1. Edit `src/config/business.js` (name, type, persona).
2. Edit `knowledge/faq.md` (hours, services, prices, contact).
3. Set `.env` (Meta creds, Supabase, Anthropic key, `CAL_LINK`).
4. Point Meta + Cal webhooks at the deployed URL.
