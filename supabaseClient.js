const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const isPlaceholder = (value = "") =>
  !value ||
  value.includes("cole_") ||
  value.includes("SUA_") ||
  value.includes("aqui");

const isValidSupabaseUrl = (value = "") => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
};

if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseKey) || !isValidSupabaseUrl(supabaseUrl)) {
  console.warn("Supabase não configurado. Servidor iniciado em modo demonstração local.");
  module.exports = null;
} else {
  module.exports = createClient(supabaseUrl, supabaseKey);
}
