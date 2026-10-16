/**
 * offline.js — a no-AI fallback "brain" used when ANTHROPIC_API_KEY isn't set.
 *
 * It does simple keyword matching against the sections of knowledge/faq.md and
 * replies with the matching section. It is NOT smart — it exists so anyone can
 * click around the demo (and the tests can run) without an API key. Add a key
 * to get real Claude replies.
 */

// Split the markdown knowledge base into { heading: "bullet text" } sections.
function parseSections(knowledge) {
  const sections = {};
  let current = null;
  for (const line of knowledge.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)/);
    if (h) {
      current = h[1].trim();
      sections[current] = [];
    } else if (current && line.trim().startsWith("- ")) {
      sections[current].push(line.trim());
    }
  }
  return sections;
}

// Which words point to which section (matched against the section heading).
const TOPICS = [
  { words: ["cancel", "reschedule", "move my", "change my"], heading: /booking|appointment/i },
  { words: ["book", "appointment", "slot", "available", "schedule"], heading: /booking|appointment/i },
  { words: ["hour", "open", "close", "timing", "when are you", "sunday", "saturday", "weekend"], heading: /hour/i },
  { words: ["price", "cost", "how much", "fee", "charge", "insurance", "pay"], heading: /pric/i },
  { words: ["where", "address", "location", "parking", "phone", "email", "contact", "call"], heading: /location|contact/i },
  { words: ["service", "offer", "do you do", "treatment", "whiten", "clean", "filling"], heading: /service|offering/i },
];

function offlineReply({ text, knowledge, business, bookingLink, booking }) {
  const q = text.toLowerCase();
  const sections = parseSections(knowledge || "");
  const pick = (re) => {
    const key = Object.keys(sections).find((k) => re.test(k));
    return key && sections[key].length ? sections[key].join("\n") : null;
  };

  if (/^(hi|hello|hey|hola|good (morning|afternoon|evening))\b/.test(q)) {
    return `Hi! 👋 Welcome to ${business.name}. I can help with our hours, services, prices, or booking an appointment. What do you need?`;
  }

  // Existing booking + reschedule/cancel request → hand over their own link.
  if (booking && /cancel/.test(q) && booking.cancel_link) {
    return `No problem. You can cancel here: ${booking.cancel_link}`;
  }
  if (booking && /reschedul|move|change/.test(q) && booking.reschedule_link) {
    return `Sure! Pick a new time here: ${booking.reschedule_link}`;
  }

  for (const topic of TOPICS) {
    if (topic.words.some((w) => q.includes(w))) {
      const answer = pick(topic.heading);
      if (!answer) break;
      const isBooking = /book|appointment|slot|available|schedule/.test(q);
      return isBooking && bookingLink ? `${answer}\n\nBook here: ${bookingLink}` : answer;
    }
  }

  return (
    `Sorry, I can only help with questions about ${business.name}: our services, hours, ` +
    "prices, or booking an appointment. 😊"
  );
}

module.exports = { offlineReply, parseSections };
