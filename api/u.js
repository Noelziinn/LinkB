// Vercel Function: entrega a página do perfil (u.html) já com as tags de preview
// (Open Graph / Twitter), para o WhatsApp, Instagram, Telegram etc. mostrarem
// foto, nome e bio quando alguém compartilha seusite.com/usuario.
//
// Os robôs dessas redes não executam JavaScript, por isso as tags precisam
// vir prontas no HTML. A página continua carregando os dados normalmente pelo
// public.js, então para quem visita nada muda.

const fs = require("fs");
const path = require("path");

// Valores públicos (os mesmos do js/supabase.js)
const SUPABASE_URL = "https://kkryumgyaeamdfwngmwq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrcnl1bWd5YWVhbWRmd25nbXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNjA4NDAsImV4cCI6MjExMDczNjg0MH0.DEfVCgI_BDZ8OW-GKInYnGxPEoTk_6LlXOGk26dfH-Y";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const HOST_RE = /^[a-z0-9.-]+(:\d+)?$/i;

// Tudo que vem do banco passa por aqui antes de entrar no HTML
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function getUsername(req) {
  // O rewrite do vercel.json manda o nome como ?username=
  let name = req.query && req.query.username;
  // Plano B: primeiro pedaço do caminho da URL
  if (!name) {
    const first =
      (req.url || "").split("?")[0].split("/").filter(Boolean)[0] || "";
    try {
      name = decodeURIComponent(first);
    } catch {
      name = "";
    }
  }
  return String(Array.isArray(name) ? name[0] : name || "")
    .trim()
    .toLowerCase();
}

async function getTemplate(host) {
  try {
    return await fs.promises.readFile(
      path.join(process.cwd(), "u.html"),
      "utf8",
    );
  } catch {
    // Plano B: busca o arquivo estático publicado
    const res = await fetch(`https://${host}/u.html`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error("template");
    return res.text();
  }
}

async function getProfile(username) {
  const url =
    `${SUPABASE_URL}/rest/v1/profiles` +
    `?select=username,display_name,bio,avatar_url&username=eq.${encodeURIComponent(username)}&limit=1`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error("supabase");
  const rows = await res.json();
  return rows[0] || null;
}

function buildMeta(profile, origin) {
  const name = profile.display_name || profile.username;
  const title = `${name} (@${profile.username}) | LinkB`;
  const description = (
    profile.bio || `Veja os links de ${name} no LinkB.`
  ).slice(0, 160);
  const hasAvatar = /^https?:\/\//i.test(profile.avatar_url || "");
  const image = hasAvatar ? profile.avatar_url : `${origin}/logo.png`;
  const pageUrl = `${origin}/${profile.username}`;

  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const i = escapeHtml(image);
  const u = escapeHtml(pageUrl);

  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${u}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="LinkB">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta property="og:image" content="${i}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${i}">`,
  ].join("\n  ");
}

module.exports = async function handler(req, res) {
  const rawHost = String(
    req.headers["x-forwarded-host"] || req.headers.host || "",
  );
  const host = HOST_RE.test(rawHost) ? rawHost : "localhost";
  const origin = `https://${host}`;

  try {
    const html = await getTemplate(host);
    const username = getUsername(req);

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    // Nome inválido ou perfil inexistente: página normal (ela mostra "não encontrado")
    if (!USERNAME_RE.test(username)) {
      res.setHeader("Cache-Control", "public, s-maxage=60");
      return res.status(404).send(html);
    }

    let profile = null;
    try {
      profile = await getProfile(username);
    } catch (err) {
      // Supabase fora do ar: entrega a página sem preview e não guarda em cache
      console.error(err);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(html);
    }

    if (!profile) {
      res.setHeader("Cache-Control", "public, s-maxage=30");
      return res.status(404).send(html);
    }

    const meta = buildMeta(profile, origin);
    // (função em vez de texto, para $ e & vindos do perfil não virarem comandos do replace)
    const page = /<title>[\s\S]*?<\/title>/i.test(html)
      ? html.replace(/<title>[\s\S]*?<\/title>/i, () => meta)
      : html.replace(/<\/head>/i, () => `  ${meta}\n</head>`);

    // Os robôs pegam rápido do cache; a bio nova aparece em até ~1 minuto
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    return res.status(200).send(page);
  } catch (err) {
    console.error(err);
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).send("Erro ao carregar a página.");
  }
};
