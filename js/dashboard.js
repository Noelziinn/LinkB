const $ = (id) => document.getElementById(id);

const MAX_LINKS = 30; // mantenha igual ao limite do limits.sql

// Ícones disponíveis: [classe do Phosphor, nome]
const ICONS = [
  ["ph-link", "Link"],
  ["ph-globe", "Site"],
  ["ph-briefcase", "Portfólio"],
  ["ph-rocket-launch", "Foguete"],
  ["ph-robot", "Robô"],
  ["ph-shopping-cart", "Loja"],
  ["ph-envelope", "E-mail"],
  ["ph-phone", "Telefone"],
  ["ph-map-pin", "Local"],
  ["ph-calendar-blank", "Agenda"],
  ["ph-file-text", "Documento"],
  ["ph-music-notes", "Música"],
  ["ph-github-logo", "GitHub"],
  ["ph-instagram-logo", "Instagram"],
  ["ph-whatsapp-logo", "WhatsApp"],
  ["ph-discord-logo", "Discord"],
  ["ph-youtube-logo", "YouTube"],
  ["ph-tiktok-logo", "TikTok"],
  ["ph-linkedin-logo", "LinkedIn"],
  ["ph-spotify-logo", "Spotify"],
  ["ph-telegram-logo", "Telegram"],
  ["ph-x-logo", "X"],
  ["ph-facebook-logo", "Facebook"],
  ["ph-twitch-logo", "Twitch"],
];

const SCROLL = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ? "auto"
  : "smooth";

let currentUser = null;
let profile = null; // linha do banco
let profileBase = null; // últimos valores salvos (para saber se mudou)
let pendingAvatar = null; // link da foto ainda não salvo
let cards = []; // cards de link, na ordem da tela
let deleting = false;

// ===== Utilidades =====
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function icon(name) {
  const i = el("i", "ph " + name);
  i.setAttribute("aria-hidden", "true");
  return i;
}

function showMsg(box, text, type = "success") {
  box.textContent = text;
  box.className = "message " + type;
  box.hidden = false;
  if (type === "success") setTimeout(() => (box.hidden = true), 2500);
}

function setStatus(box, text, kind = "") {
  box.textContent = text;
  box.dataset.kind = kind;
}

// Mostra um texto por alguns segundos e depois apaga
function flashStatus(box, text, kind = "ok", ms = 2200, after) {
  setStatus(box, text, kind);
  setTimeout(() => {
    if (box.textContent === text) {
      setStatus(box, "", "");
      if (after) after();
    }
  }, ms);
}

function normalizeUrl(value) {
  let url = (value || "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

// Endereço público da página (curto no site publicado, completo no teste local)
function publicUrl() {
  const user = encodeURIComponent(profile.username);
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  return local
    ? `${location.origin}/u.html?user=${user}`
    : `${location.origin}/${user}`;
}

const plural = (n) => (n === 1 ? "1 clique" : `${n} cliques`);
const initial = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";

async function logout() {
  await db.auth.signOut();
  window.location.href = "login.html";
}

// Sair pela barra lateral (ou em outra aba) leva ao login
db.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" && !deleting) window.location.href = "login.html";
});

// ===== Início: só entra quem está logado =====
async function init() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
    return;
  }
  currentUser = data.session.user;

  if ((await loadProfile()) === false) return;
  await loadLinks();
  $("app").hidden = false;
}

// ===== Perfil =====
async function loadProfile() {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error || !data) {
    console.error(error);
    alert("Não foi possível carregar seu perfil. Tente entrar de novo.");
    return logout();
  }

  // Conta criada por Google/GitHub ainda sem nome de usuário escolhido
  if (data.username_set === false) {
    window.location.href = "escolher-usuario.html";
    return false;
  }

  profile = data;
  $("who").textContent = "@" + profile.username;
  $("delete-username").textContent = profile.username;
  $("public-link").href = publicUrl();
  $("display_name").value = profile.display_name || "";
  $("bio").value = profile.bio || "";
  $("accent_color").value = /^#[0-9a-f]{6}$/i.test(profile.accent_color || "")
    ? profile.accent_color
    : "#6366f1";
  pendingAvatar = profile.avatar_url || null;

  profileBase = readProfile();
  renderAvatar();
  updateProfileUI();
}

function readProfile() {
  return {
    display_name: $("display_name").value.trim() || null,
    bio: $("bio").value.trim() || null,
    avatar_url: pendingAvatar,
    accent_color: $("accent_color").value,
  };
}

const profileDirty = () =>
  !!profileBase &&
  JSON.stringify(readProfile()) !== JSON.stringify(profileBase);

function renderAvatar() {
  const view = $("avatar-view");
  const name =
    $("display_name").value.trim() || (profile && profile.username) || "?";
  view.replaceChildren();

  if (pendingAvatar && /^https?:\/\//i.test(pendingAvatar)) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = pendingAvatar;
    img.addEventListener("error", () =>
      view.replaceChildren(document.createTextNode(initial(name))),
    );
    view.append(img);
  } else {
    view.textContent = initial(name);
  }
}

function updateProfileUI() {
  const dirty = profileDirty();
  const status = $("profile-status");
  $("profile-save").disabled = !dirty;
  $("profile-save").classList.toggle("dirty", dirty);

  if (dirty) setStatus(status, "Alterações não salvas", "warn");
  else if (status.dataset.kind === "warn") setStatus(status, "", "");
}

$("display_name").addEventListener("input", () => {
  renderAvatar();
  updateProfileUI();
});
$("bio").addEventListener("input", updateProfileUI);
$("accent_color").addEventListener("input", updateProfileUI);

// ----- Foto de perfil (menu ao clicar na imagem) -----
const avatarPop = $("avatar-pop");

function openAvatarPop() {
  $("avatar-url").value = pendingAvatar || "";
  setStatus($("avatar-msg"), "", "");
  avatarPop.hidden = false;
  $("avatar-btn").setAttribute("aria-expanded", "true");
  $("avatar-url").focus();
}

function closeAvatarPop(returnFocus = false) {
  avatarPop.hidden = true;
  $("avatar-btn").setAttribute("aria-expanded", "false");
  if (returnFocus) $("avatar-btn").focus();
}

$("avatar-btn").addEventListener("click", () => {
  if (avatarPop.hidden) openAvatarPop();
  else closeAvatarPop();
});

document.addEventListener("click", (e) => {
  if (!avatarPop.hidden && !e.target.closest(".avatar-edit")) closeAvatarPop();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !avatarPop.hidden) closeAvatarPop(true);
});

$("avatar-apply").addEventListener("click", () => {
  const raw = $("avatar-url").value.trim();
  const url = raw ? normalizeUrl(raw) : null;

  if (raw && (!url || url.length > 2000)) {
    return setStatus($("avatar-msg"), "Esse link não é válido.", "error");
  }
  pendingAvatar = url;
  renderAvatar();
  updateProfileUI();
  closeAvatarPop(true);
});

$("avatar-url").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("avatar-apply").click();
  }
});

$("avatar-remove").addEventListener("click", () => {
  pendingAvatar = null;
  renderAvatar();
  updateProfileUI();
  closeAvatarPop(true);
});

// ----- Salvar perfil -----
$("profile-save").addEventListener("click", async () => {
  if (!profileDirty()) return;
  const values = readProfile();
  const status = $("profile-status");

  $("profile-save").disabled = true;
  setStatus(status, "Salvando...", "");

  const { error } = await db
    .from("profiles")
    .update(values)
    .eq("id", currentUser.id);

  if (error) {
    console.error(error);
    updateProfileUI();
    flashStatus(
      status,
      "Não foi possível salvar.",
      "error",
      4000,
      updateProfileUI,
    );
    return;
  }

  profileBase = values;
  updateProfileUI();
  flashStatus(status, "Salvo", "ok");
});

// ----- Copiar link -----
let copyTimer = null;
$("copy-link").addEventListener("click", async () => {
  const url = publicUrl();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt("Copie o endereço da sua página:", url);
    return;
  }

  $("copy-label").textContent = "Copiado!";
  $("copy-icon").className = "ph ph-check";
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    $("copy-label").textContent = "Copiar link";
    $("copy-icon").className = "ph ph-copy";
  }, 2000);
});

// ===== Links (cards) =====
const pick = (l) => ({
  title: l.title || "",
  subtitle: l.subtitle || "",
  url: l.url || "",
  icon: l.icon || "ph-link",
  featured: !!l.featured,
});

const normState = (s) =>
  JSON.stringify({
    title: s.title.trim(),
    subtitle: s.subtitle.trim(),
    url: s.url.trim(),
    icon: s.icon,
    featured: s.featured,
  });

const cardDirty = (c) => c.draft || normState(c.state) !== normState(c.base);
const savedCards = () => cards.filter((c) => !c.draft);

async function loadLinks() {
  const { data, error } = await db
    .from("links")
    .select("*")
    .eq("profile_id", currentUser.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    showMsg($("link-msg"), "Não foi possível carregar seus links.", "error");
    return;
  }

  cards = data.map((l) => createCard(l));
  $("link-list").replaceChildren(...cards.map((c) => c.el));
  cards.forEach(refresh);
  refreshMoveButtons();
  updateTotals();
  updateEmpty();
}

function textInput(label, placeholder, max, value) {
  const i = document.createElement("input");
  i.type = "text";
  i.placeholder = placeholder;
  i.maxLength = max;
  i.value = value;
  i.setAttribute("aria-label", label);
  return i;
}

function toolBtn(extraClass = "") {
  const b = el("button", "tool " + extraClass);
  b.type = "button";
  return b;
}

function iconOnlyBtn(label, iconName, extraClass = "") {
  const b = toolBtn("icon-only " + extraClass);
  b.setAttribute("aria-label", label);
  b.title = label;
  const i = icon(iconName);
  b.append(i);
  return { b, i };
}

// link = null cria um rascunho (card novo, ainda não salvo)
function createCard(link) {
  const card = {
    id: link ? link.id : null,
    draft: !link,
    active: link ? link.active !== false : true,
    clicks: link ? link.clicks || 0 : 0,
    state: pick(link || {}),
    base: link ? pick(link) : null,
    refs: {},
  };

  const li = el("li", "lcard" + (card.draft ? " draft" : ""));
  card.el = li;

  // Campos
  const fields = el("div", "lcard-fields");
  const title = textInput(
    "Título do link",
    "Título do link",
    60,
    card.state.title,
  );
  const url = textInput(
    "Endereço do link",
    "seu-site.com/pagina",
    2000,
    card.state.url,
  );
  url.inputMode = "url";
  url.autocapitalize = "none";
  url.spellcheck = false;
  const subtitle = textInput(
    "Descrição (opcional)",
    "Descrição (opcional)",
    80,
    card.state.subtitle,
  );
  fields.append(title, url, subtitle);

  // Ferramentas
  const tools = el("div", "lcard-tools");

  const iconBtn = toolBtn();
  iconBtn.setAttribute("aria-expanded", "false");
  const iconPrev = icon(card.state.icon);
  iconBtn.append(iconPrev, el("span", "", "Ícone"), icon("ph-caret-down"));

  const featBtn = toolBtn();
  const featIcon = icon("ph-star");
  featBtn.append(featIcon, el("span", "", "Destaque"));

  const clicks = el("span", "clicks");
  const clicksText = el("span", "", plural(card.clicks));
  clicks.append(icon("ph-cursor-click"), clicksText);

  const up = iconOnlyBtn("Mover para cima", "ph-arrow-up");
  const down = iconOnlyBtn("Mover para baixo", "ph-arrow-down");
  const eye = iconOnlyBtn("Ocultar link", "ph-eye");
  const trash = iconOnlyBtn("Excluir link", "ph-trash", "danger");

  tools.append(
    iconBtn,
    featBtn,
    clicks,
    el("span", "spacer"),
    up.b,
    down.b,
    eye.b,
    trash.b,
  );

  // Seletor de ícones
  const grid = el("div", "icon-grid");
  grid.hidden = true;
  ICONS.forEach(([cls, label]) => {
    const b = el("button", "icon-opt");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.dataset.icon = cls;
    b.append(icon(cls));
    b.addEventListener("click", () => {
      card.state.icon = cls;
      grid.hidden = true;
      iconBtn.setAttribute("aria-expanded", "false");
      refresh(card);
    });
    grid.append(b);
  });

  // Rodapé com Salvar
  const foot = el("div", "lcard-foot");
  const status = el("span", "lcard-status");
  status.setAttribute("role", "status");
  const save = el("button", "btn-save dirty", "Salvar");
  save.type = "button";
  foot.append(status, save);

  li.append(fields, tools, grid, foot);

  card.refs = {
    title,
    url,
    subtitle,
    iconBtn,
    iconPrev,
    grid,
    featBtn,
    featIcon,
    clicks,
    clicksText,
    up: up.b,
    down: down.b,
    eye: eye.b,
    eyeIcon: eye.i,
    trash: trash.b,
    foot,
    status,
    save,
  };

  // Eventos
  title.addEventListener("input", () => {
    card.state.title = title.value;
    refresh(card);
  });
  url.addEventListener("input", () => {
    card.state.url = url.value;
    refresh(card);
  });
  subtitle.addEventListener("input", () => {
    card.state.subtitle = subtitle.value;
    refresh(card);
  });

  [title, url, subtitle].forEach((input) =>
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveCard(card);
      }
    }),
  );

  iconBtn.addEventListener("click", () => {
    const open = grid.hidden;
    grid.hidden = !open;
    iconBtn.setAttribute("aria-expanded", String(open));
  });
  featBtn.addEventListener("click", () => {
    card.state.featured = !card.state.featured;
    refresh(card);
  });
  up.b.addEventListener("click", () => moveCard(card, -1));
  down.b.addEventListener("click", () => moveCard(card, 1));
  eye.b.addEventListener("click", () => toggleActive(card));
  trash.b.addEventListener("click", () => removeCard(card));
  save.addEventListener("click", () => saveCard(card));

  refresh(card);
  return card;
}

// Atualiza a aparência do card conforme o estado dele
function refresh(card) {
  const r = card.refs;
  const dirty = cardDirty(card);

  r.iconPrev.className = "ph " + card.state.icon;
  r.grid
    .querySelectorAll(".icon-opt")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.icon === card.state.icon),
      ),
    );
  r.featBtn.setAttribute("aria-pressed", String(card.state.featured));
  r.featIcon.className =
    "ph " + (card.state.featured ? "ph-star-fill" : "ph-star");

  r.eye.setAttribute(
    "aria-label",
    card.active ? "Ocultar link" : "Mostrar link",
  );
  r.eye.title = card.active ? "Ocultar link" : "Mostrar link";
  r.eyeIcon.className = "ph " + (card.active ? "ph-eye" : "ph-eye-slash");
  card.el.classList.toggle("inactive", !card.active);
  card.el.classList.toggle("draft", card.draft);

  r.clicksText.textContent = plural(card.clicks);

  // Rascunho ainda não tem posição, visibilidade nem cliques
  [r.up, r.down, r.eye, r.clicks].forEach((x) => (x.hidden = card.draft));

  r.save.hidden = !dirty;
  r.foot.hidden = !(dirty || r.status.textContent);
}

function cardFlash(card, text, kind, ms) {
  flashStatus(card.refs.status, text, kind, ms, () => refresh(card));
  refresh(card);
}

function refreshMoveButtons() {
  const saved = savedCards();
  saved.forEach((c, i) => {
    c.refs.up.disabled = i === 0;
    c.refs.down.disabled = i === saved.length - 1;
  });
}

function updateTotals() {
  const saved = savedCards();
  const total = saved.reduce((sum, c) => sum + c.clicks, 0);
  const box = $("total-clicks");
  box.hidden = saved.length === 0;
  box.textContent = plural(total) + " no total";
}

function updateEmpty() {
  $("empty-links").hidden = cards.length > 0;
}

// ----- Adicionar -----
$("add-link").addEventListener("click", () => {
  const existing = cards.find((c) => c.draft);
  if (existing) {
    existing.refs.title.focus();
    return;
  }
  if (savedCards().length >= MAX_LINKS) {
    return showMsg(
      $("link-msg"),
      `Você chegou ao limite de ${MAX_LINKS} links. Exclua algum para adicionar outro.`,
      "error",
    );
  }

  const card = createCard(null);
  cards.push(card);
  $("link-list").append(card.el);
  updateEmpty();
  refreshMoveButtons();
  card.el.scrollIntoView({ behavior: SCROLL, block: "center" });
  card.refs.title.focus();
});

// ----- Salvar um card -----
async function saveCard(card) {
  const s = card.state;
  const r = card.refs;

  const title = s.title.trim();
  const url = normalizeUrl(s.url);

  if (!title) return cardFlash(card, "Dê um título ao link.", "error", 4000);
  if (!url)
    return cardFlash(card, "O endereço do link não é válido.", "error", 4000);
  if (url.length > 2000)
    return cardFlash(card, "O endereço do link é muito longo.", "error", 4000);
  if (card.draft && savedCards().length >= MAX_LINKS) {
    return cardFlash(
      card,
      `Limite de ${MAX_LINKS} links atingido.`,
      "error",
      4000,
    );
  }

  const payload = {
    title,
    subtitle: s.subtitle.trim() || null,
    url,
    icon: s.icon,
    featured: s.featured,
  };

  r.save.disabled = true;
  let error;
  let saved = null;

  if (card.draft) {
    const res = await db
      .from("links")
      .insert({
        ...payload,
        profile_id: currentUser.id,
        position: savedCards().length,
      })
      .select()
      .single();
    error = res.error;
    saved = res.data;
  } else {
    ({ error } = await db.from("links").update(payload).eq("id", card.id));
  }

  r.save.disabled = false;

  if (error) {
    console.error(error);
    const limit = (error.message || "").includes("LINK_LIMIT_REACHED");
    return cardFlash(
      card,
      limit
        ? `Limite de ${MAX_LINKS} links atingido.`
        : "Não foi possível salvar. Tente de novo.",
      "error",
      4000,
    );
  }

  if (card.draft && saved) {
    card.id = saved.id;
    card.draft = false;
    card.active = saved.active !== false;
    card.clicks = saved.clicks || 0;
  }

  card.state = pick(payload);
  card.base = pick(payload);
  r.title.value = card.state.title;
  r.url.value = card.state.url;
  r.subtitle.value = card.state.subtitle;

  refreshMoveButtons();
  updateTotals();
  cardFlash(card, "Salvo", "ok", 2200);
}

// ----- Mover, ocultar e excluir (acontecem na hora) -----
async function moveCard(card, dir) {
  const saved = savedCards();
  const i = saved.indexOf(card);
  const j = i + dir;
  if (j < 0 || j >= saved.length) return;
  const other = saved[j];

  const parent = card.el.parentNode;
  if (dir < 0) parent.insertBefore(card.el, other.el);
  else parent.insertBefore(other.el, card.el);

  const ci = cards.indexOf(card);
  const oi = cards.indexOf(other);
  [cards[ci], cards[oi]] = [cards[oi], cards[ci]];

  refreshMoveButtons();
  (dir < 0 ? card.refs.up : card.refs.down).focus();

  const results = await Promise.all(
    savedCards().map((c, idx) =>
      db.from("links").update({ position: idx }).eq("id", c.id),
    ),
  );
  if (results.some((res) => res.error)) {
    showMsg(
      $("link-msg"),
      "Não foi possível salvar a nova ordem. Recarregue a página.",
      "error",
    );
  }
}

async function toggleActive(card) {
  const next = !card.active;
  card.refs.eye.disabled = true;

  const { error } = await db
    .from("links")
    .update({ active: next })
    .eq("id", card.id);
  card.refs.eye.disabled = false;

  if (error) {
    console.error(error);
    return cardFlash(card, "Não foi possível atualizar.", "error", 4000);
  }
  card.active = next;
  refresh(card);
}

async function removeCard(card) {
  if (!card.draft) {
    const name = card.base.title || "este link";
    if (!confirm(`Excluir o link "${name}"?`)) return;

    const { error } = await db.from("links").delete().eq("id", card.id);
    if (error) {
      console.error(error);
      return cardFlash(card, "Não foi possível excluir.", "error", 4000);
    }
  }

  card.el.remove();
  cards = cards.filter((c) => c !== card);
  refreshMoveButtons();
  updateTotals();
  updateEmpty();
}

// ===== Excluir conta =====
const deleteInput = $("delete-confirm");
const deleteBtn = $("delete-btn");

function confirmationMatches() {
  return (
    !!profile && deleteInput.value.trim().toLowerCase() === profile.username
  );
}

// O botão só liga quando o nome de usuário digitado bate
deleteInput.addEventListener("input", () => {
  deleteBtn.disabled = !confirmationMatches();
});

deleteBtn.addEventListener("click", async () => {
  if (!confirmationMatches()) return;

  deleteBtn.disabled = true;
  deleteInput.disabled = true;
  deleting = true;

  const { error } = await db.rpc("delete_my_account");

  if (error) {
    console.error(error);
    deleting = false;
    showMsg(
      $("delete-msg"),
      "Não foi possível excluir a conta. Tente de novo.",
      "error",
    );
    deleteInput.disabled = false;
    deleteBtn.disabled = !confirmationMatches();
    return;
  }

  // A conta já não existe no servidor; só limpa a sessão local
  await db.auth.signOut({ scope: "local" });
  window.location.href = "login.html?conta=excluida";
});

// ===== Avisa se tentar sair com alterações não salvas =====
window.addEventListener("beforeunload", (e) => {
  if (deleting) return;
  const unsavedCard = cards.some((c) =>
    c.draft ? c.state.title.trim() || c.state.url.trim() : cardDirty(c),
  );
  if (profileDirty() || unsavedCard) {
    e.preventDefault();
    e.returnValue = "";
  }
});

init();
