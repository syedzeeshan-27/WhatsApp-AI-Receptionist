/**
 * store.js — picks where conversations and bookings are stored.
 *
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → Supabase (persistent).
 * Otherwise → in-memory (zero setup, wiped on restart). Good for trying it out.
 */
const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = {
  backend: useSupabase ? "supabase" : "memory",
  ...(useSupabase ? require("./supabase") : require("./memory")),
};
