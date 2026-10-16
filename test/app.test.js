// Run with: npm test
// Runs fully offline: no API key, no database, no WhatsApp. Any keys in your
// .env are blanked out first so the tests never touch real services.
for (const k of [
  "ANTHROPIC_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "CAL_LINK",
  "CAL_WEBHOOK_SECRET",
  "PUBLIC_URL",
]) {
  process.env[k] = "";
}
process.env.WEB_CHAT = "on";
process.env.WEB_CHAT_SESSION_LIMIT = "5";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const memory = require("../src/services/memory");
const { offlineReply } = require("../src/services/offline");
const { verifySignature, extractPhone } = require("../src/routes/cal");
const { verifyMetaSignature } = require("../src/routes/webhook");
const { handleIncoming } = require("../src/services/conversation");
const { start } = require("../src/index");

const business = { name: "Test Clinic" };
const FAQ = "## Hours\n- Mon–Fri 9–5\n\n## Pricing\n- Cleaning: $80\n\n## Booking & Appointments\n- Book online.";

test("history returns the LATEST messages, oldest first", async () => {
  for (let i = 1; i <= 30; i++) await memory.saveMessage({ waId: "h1", role: "user", content: `m${i}` });
  const h = await memory.getHistory("h1", 20);
  assert.equal(h.length, 20);
  assert.equal(h[0].content, "m11");
  assert.equal(h[19].content, "m30");
});

test("duplicate WhatsApp delivery is answered only once", async () => {
  const first = await handleIncoming({ waId: "d1", text: "What are your hours?", messageId: "wamid.X" });
  const second = await handleIncoming({ waId: "d1", text: "What are your hours?", messageId: "wamid.X" });
  assert.ok(first);
  assert.equal(second, null);
  const h = await memory.getHistory("d1");
  assert.equal(h.length, 2); // one user message + one reply
});

test("offline brain answers from the knowledge base", () => {
  assert.match(offlineReply({ text: "what are your hours", knowledge: FAQ, business }), /Mon–Fri/);
  assert.match(offlineReply({ text: "how much is a cleaning?", knowledge: FAQ, business }), /\$80/);
  assert.match(
    offlineReply({ text: "can I book?", knowledge: FAQ, business, bookingLink: "https://x.test/b" }),
    /https:\/\/x\.test\/b/
  );
  assert.match(offlineReply({ text: "write an essay on Rome", knowledge: FAQ, business }), /only help/);
});

test("Cal.com signature check", () => {
  const body = Buffer.from('{"a":1}');
  const sig = crypto.createHmac("sha256", "s3cret").update(body).digest("hex");
  assert.equal(verifySignature(body, sig, "s3cret"), true);
  assert.equal(verifySignature(body, "00" + sig.slice(2), "s3cret"), false);
  assert.equal(verifySignature(body, undefined, "s3cret"), false);
});

test("Meta signature check", () => {
  const body = Buffer.from('{"entry":[]}');
  const sig = "sha256=" + crypto.createHmac("sha256", "appsecret").update(body).digest("hex");
  assert.equal(verifyMetaSignature(body, sig, "appsecret"), true);
  assert.equal(verifyMetaSignature(body, "sha256=deadbeef", "appsecret"), false);
  assert.equal(verifyMetaSignature(body, undefined, "appsecret"), false);
});

test("phone number is found in Cal payloads", () => {
  assert.equal(extractPhone({ attendees: [{ phoneNumber: "+1 (555) 010-0123" }] }), "15550100123");
  assert.equal(extractPhone({ responses: { location: { value: { optionValue: "+44 7700 900123" } } } }), "447700900123");
  assert.equal(extractPhone({}), null);
});

test("web chat + demo booking work end to end", async (t) => {
  const server = start(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) =>
    fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const info = await (await fetch(base + "/api/info")).json();
  assert.equal(info.ai, "offline");
  assert.equal(info.storage, "memory");

  // Webhook verification must fail when no verify token is configured.
  const verify = await fetch(base + "/webhook?hub.mode=subscribe&hub.challenge=abc");
  assert.equal(verify.status, 403);

  const s = "testsession1";
  const r1 = await (await post("/api/chat", { sessionId: s, text: "I'd like to book a check-up" })).json();
  assert.match(r1.reply, /book\.html\?s=testsession1/);

  const booked = await post("/api/demo/book", { sessionId: s, name: "Sam", startTime: "2030-01-07T10:00:00Z" });
  assert.equal(booked.status, 200);
  const inbox = await (await fetch(`${base}/api/chat/${s}/inbox`)).json();
  assert.equal(inbox.messages.length, 1);
  assert.match(inbox.messages[0].text, /Hi Sam! ✅ Your appointment is confirmed/);

  const r2 = await (await post("/api/chat", { sessionId: s, text: "I need to reschedule" })).json();
  assert.match(r2.reply, /action=reschedule/);

  // Per-session limit (set to 5 above): 2 used, 3 more allowed, then 429.
  for (let i = 0; i < 3; i++) await post("/api/chat", { sessionId: s, text: "hours?" });
  assert.equal((await post("/api/chat", { sessionId: s, text: "hours?" })).status, 429);
});
