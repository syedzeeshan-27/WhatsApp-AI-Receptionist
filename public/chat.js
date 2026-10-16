// Browser side of the chat simulator. Talks to src/routes/chat.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const list = $("messages");
  const input = $("input");
  const sendBtn = $("send");

  // One session per tab: a fresh chat on every page load.
  const sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  let busy = false;

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Long links (booking pages with ids) are hard to read in a bubble: show
  // host + path, and an ellipsis if there's more. The full URL is still the href.
  function shortUrl(url) {
    try {
      const u = new URL(url.replace(/&amp;/g, "&"));
      const shown = u.host + u.pathname.replace(/\/$/, "");
      return u.search || u.hash ? shown + "…" : shown;
    } catch {
      return url;
    }
  }

  // Escape HTML, then apply WhatsApp formatting (*bold*, _italic_) and linkify URLs.
  function format(text) {
    const esc = text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    return esc
      .replace(/(https?:\/\/[^\s<]+[^\s<.,!?)])/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${shortUrl(url)}</a>`)
      .replace(/(^|\s)\*([^*\n]+)\*/g, "$1<b>$2</b>")
      .replace(/(^|\s)_([^_\n]+)_/g, "$1<i>$2</i>");
  }

  function add(text, who, extra) {
    const el = document.createElement("div");
    el.className = `msg ${who}${extra ? " " + extra : ""}`;
    el.innerHTML = `${format(text)}<span class="time">${now()}</span>`;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  }

  function typing(on) {
    let t = list.querySelector(".typing");
    if (on && !t) {
      t = document.createElement("div");
      t.className = "typing";
      t.innerHTML = "<span></span><span></span><span></span>";
      list.appendChild(t);
      list.scrollTop = list.scrollHeight;
      $("sub").textContent = "typing…";
    } else if (!on && t) {
      t.remove();
      $("sub").textContent = "online";
    }
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    add(text, "out");
    typing(true);
    try {
      const res = await fetch("api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text }),
      });
      const data = await res.json();
      typing(false);
      if (data.reply) add(data.reply, "in");
      else add(data.error || "Something went wrong.", "in", "error");
    } catch {
      typing(false);
      add("Can't reach the server.", "in", "error");
    }
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }

  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });
  $("chips").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") send(e.target.textContent);
  });

  // Booking confirmations arrive outside a reply (like a WhatsApp push).
  setInterval(async () => {
    try {
      const res = await fetch(`api/chat/${sessionId}/inbox`);
      const data = await res.json();
      (data.messages || []).forEach((m) => add(m.text, "in"));
    } catch {}
  }, 2000);

  fetch("api/info")
    .then((r) => r.json())
    .then((info) => {
      $("bizName").textContent = info.business;
      document.title = `${info.business} · AI Receptionist`;
      const items = [
        info.ai === "offline"
          ? "<b>AI:</b> offline mode (keyword replies, add an API key for Claude)"
          : `<b>AI:</b> ${info.ai}`,
        `<b>Memory:</b> ${info.storage === "supabase" ? "Supabase" : "in-memory"}`,
        `<b>Booking:</b> ${info.demoBooking ? "demo page" : "Cal.com"}`,
      ];
      $("status").innerHTML = items.map((i) => `<li>${i}</li>`).join("");
    })
    .catch(() => ($("status").innerHTML = "<li>Server unreachable</li>"));

  input.focus();
})();
