require("dotenv").config();

const express = require("express");

const webhookRouter = require("./routes/webhook");
const calRouter = require("./routes/cal");

const app = express();

// Parse JSON, and stash the raw body so we can verify webhook signatures
// (Cal.com signs the exact bytes it sent — we must hash the raw body, not the
// re-serialized JSON).
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const PORT = process.env.PORT || 3000;

// Health check — lets us confirm the server is up (used to verify Stage 0).
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "whatsapp-ai-receptionist" });
});

// WhatsApp webhook (Stage 1: GET verification; Stage 2 adds POST).
app.use("/webhook", webhookRouter);

// Cal.com booking webhook (Stage 7 Level 2: sends WhatsApp confirmations).
// Mounted at both spellings so a singular/plural typo in the Cal config works.
app.use("/webhooks/cal", calRouter);
app.use("/webhook/cal", calRouter);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
