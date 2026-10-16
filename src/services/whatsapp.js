/**
 * whatsapp.js — sends outgoing WhatsApp messages via Meta's Graph API.
 *
 * Given a recipient's number and some text, it POSTs to the Cloud API so the
 * message lands in their WhatsApp chat.
 *
 * Auth uses WHATSAPP_ACCESS_TOKEN (bearer) + WHATSAPP_PHONE_NUMBER_ID (which of
 * your numbers is sending) — both from the Meta dashboard.
 */
const axios = require("axios");

// Graph API version. Bump this if Meta deprecates it; messages payload is stable.
const GRAPH_API_VERSION = "v22.0";

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const isConfigured = Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);

/**
 * Send a plain text WhatsApp message.
 *
 * @param {string} to   - recipient's WhatsApp number (e.g. 919876543210)
 * @param {string} text - the message body
 * @returns {Promise<object>} Meta's API response data
 */
async function sendMessage(to, text) {
  if (!isConfigured) {
    console.warn(`WhatsApp not configured — not sending to ${to}: ${text}`);
    return null;
  }
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (err) {
    // Meta returns useful error details in the response body — surface them so
    // failures (expired token, outside 24h window, etc.) are easy to diagnose.
    const detail = err.response?.data?.error || err.message;
    console.error("WhatsApp send failed:", JSON.stringify(detail));
    throw err;
  }
}

module.exports = { sendMessage, isConfigured };
