const $ = (id) => document.getElementById(id);

function showState(text, withHomeLink = false) {
  const el = $("state");
  el.hidden = false;
  el.replaceChildren(document.createTextNode(text));
  if (withHomeLink) {
    el.append(document.createElement("br"));
    const a = document.createElement("a");
    a.href = "index.html";
    a.textContent = "Voltar ao início";
    el.append(a);
  }
}

// Define a cor de destaque (só aceita hex válido)
function applyAccent(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const root = document.documentElement.style;
  root.setProperty("--accent", hex);
  root.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.25)`);
}

function isSafeUrl(url) {
  return /^https?:\/\//i.test(url);
}

function renderAvatar(profile) {
  const wrapper = $("avatar-wrapper");
  const name = profile.display_name || profile.username;

  if (profile.avatar_url && isSafeUrl(profile.avatar_url)) {
    const img = document.createElement("img");
    img.className = "avatar";
    img.alt = "Foto de " + name;
    img.src = profile.avatar_url;
    // Se a imagem falhar, cai pra inicial
    img.addEventListener("error", () => {
      wrapper.replaceChildren(makeFallback(name));
    });
    wrapper.append(img);
  } else {
    wrapper.append(makeFallback(name));
  }
}

function makeFallback(name) {
  const div = document.createElement("div");
  div.className = "avatar-fallback";
  div.textContent = name.trim().charAt(0).toUpperCase() || "?";
  return div;
}

function renderLink(link) {
  const a = document.createElement("a");
  a.className = "link-card" + (link.featured ? " featured" : "");
  a.href = link.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const icon = document.createElement("i");
  const iconClass = /^ph-[a-z0-9-]+$/.test(link.icon || "")
    ? link.icon
    : "ph-link";
  icon.className = "ph " + iconClass;

  const arrow = document.createElement("i");
  arrow.className = "ph ph-arrow-up-right arrow";

  if (link.subtitle) {
    const box = document.createElement("div");
    box.className = "link-text";
    const strong = document.createElement("strong");
    strong.textContent = link.title;
    const span = document.createElement("span");
    span.textContent = link.subtitle;
    box.append(strong, span);
    a.append(icon, box, arrow);
  } else {
    const span = document.createElement("span");
    span.textContent = link.title;
    a.append(icon, span, arrow);
  }

  // Conta o clique sem atrapalhar a navegação
  a.addEventListener("click", () => {
    db.rpc("increment_click", { link_id: link.id }).then(({ error }) => {
      if (error) console.error(error);
    });
  });

  return a;
}

// Aceita u.html?user=noel (teste local) ou seusite.com/noel (hospedado)
function getUsername() {
  const fromQuery = new URLSearchParams(location.search).get("user");
  if (fromQuery) return fromQuery.trim().toLowerCase();

  const segment = location.pathname.split("/").filter(Boolean)[0] || "";
  try {
    return decodeURIComponent(segment).trim().toLowerCase();
  } catch {
    return "";
  }
}

async function init() {
  const username = getUsername();

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    document.title = "Página não encontrada";
    return showState("Página não encontrada.", true);
  }

  const { data: profile, error } = await db
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, accent_color")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error(error);
    return showState("Não foi possível carregar esta página. Tente de novo.");
  }
  if (!profile) {
    document.title = "Página não encontrada";
    return showState("Esse perfil não existe.", true);
  }

  const { data: links, error: linksError } = await db
    .from("links")
    .select("id, title, subtitle, url, icon, featured, position")
    .eq("profile_id", profile.id)
    .eq("active", true)
    .order("position", { ascending: true });

  if (linksError) console.error(linksError);

  // Monta a página
  const displayName = profile.display_name || profile.username;
  document.title = displayName + " | Links";
  applyAccent(profile.accent_color);
  renderAvatar(profile);
  $("name").textContent = displayName;
  $("bio").textContent = profile.bio || "";
  $("bio").hidden = !profile.bio;

  const list = $("links");
  const safeLinks = (links || []).filter((l) => isSafeUrl(l.url));

  if (safeLinks.length === 0) {
    const p = document.createElement("p");
    p.className = "state";
    p.textContent = "Nenhum link por aqui ainda.";
    list.append(p);
  } else {
    safeLinks.forEach((l) => list.append(renderLink(l)));
  }

  $("state").hidden = true;
  $("profile").hidden = false;
  list.hidden = false;
}

init();
