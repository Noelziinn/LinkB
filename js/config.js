// Configurações públicas do site (nada aqui é secreto)

const SITE_NAME = "LinkB";

// E-mail que aparece nos Termos, na Privacidade e no botão "Denunciar"
const CONTACT_EMAIL = "atanaellps13@gmail.com";

// Chave pública (Site Key) do Cloudflare Turnstile.
// Enquanto estiver vazia, o CAPTCHA não aparece.
const TURNSTILE_SITE_KEY = "0x4AAAAAAGK52O4rn9TdNSSN";

// Entradas sociais ativas. Só coloque depois de configurar no Supabase.
// Opções: "google", "github"
const ENABLED_PROVIDERS = ["github"];

// Nomes que conflitam com páginas do site (mantenha igual ao social-login.sql)
const RESERVED_USERNAMES = [
  "login",
  "dashboard",
  "u",
  "index",
  "admin",
  "api",
  "js",
  "css",
  "assets",
  "style",
  "auth",
  "signup",
  "cadastro",
  "settings",
  "privacy",
  "terms",
  "about",
  "sobre",
  "suporte",
  "support",
  "www",
  "app",
  "public",
  "site",
  "termos",
  "privacidade",
  "landing",
  "reset",
  "config",
  "escolher",
];
