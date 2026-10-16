require("dotenv").config();

const path = require("path");
const express = require("express");

const business = require("./config/business");
const webhookRouter = require("./routes/webhook");
const calRouter = require("./routes/cal");
const chatRouter = require("./routes/chat");
const { AI_ENABLED, MODEL } = require("./services/claude");
const store = require("./services/store");
const whatsapp = require("./services/whatsapp");

const app = express();

// Behind Render/Railway/ngrok the real protocol + host come from proxy headers.
app.set("trust proxy", 1);

// Parse JSON, and stash the raw body so we can verify webhook signatures
// (Meta and Cal.com sign the exact bytes they sent — we must hash the raw body,
// not the re-serialized JSON).
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const WEB_CHAT = (process.env.WEB_CHAT || "on").toLowerCase() !== "off";

// Health check — lets you (and your host) confirm the server is up.
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "whatsapp-ai-receptionist" });
});

// WhatsApp webhook (GET = Meta verification, POST = incoming messages).
app.use("/webhook", webhookRouter);

// Cal.com booking webhook. Mounted at both spellings so a singular/plural typo
// in the Cal config still works.
app.use("/webhooks/cal", calRouter);
app.use("/webhook/cal", calRouter);

// Browser chat simulator + demo booking page.
if (WEB_CHAT) {
  app.use("/api", chatRouter);
  app.use(express.static(path.join(__dirname, "..", "public")));
} else {
  app.get("/", (req, res) => res.send("WhatsApp AI receptionist is running."));
}

function start(port = process.env.PORT || 3000) {
  return app.listen(port, () => {
    console.log(`\n${business.name} receptionist listening on http://localhost:${port}`);
    console.log(`  AI:        ${AI_ENABLED ? MODEL : "OFFLINE (no ANTHROPIC_API_KEY — canned keyword replies)"}`);
    console.log(`  Storage:   ${store.backend === "supabase" ? "Supabase" : "in-memory (wiped on restart)"}`);
    console.log(`  WhatsApp:  ${whatsapp.isConfigured ? "configured" : "not configured (web chat only)"}`);
    console.log(`  Web chat:  ${WEB_CHAT ? `http://localhost:${port}/` : "off"}\n`);
  });
}

if (require.main === module) start();

module.exports = { app, start };
