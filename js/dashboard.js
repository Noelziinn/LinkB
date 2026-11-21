const $ = (id) => document.getElementById(id);

const MAX_LINKS = 30; // mantenha igual ao limite do limits.sql

// Fotos de perfil (Supabase Storage)
const AVATAR_BUCKET = "avatars";
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_INPUT = 8 * 1024 * 1024; // imagem original aceita
const AVATAR_SIZE = 512; // lado da foto depois de redimensionar

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
let pendingAvatar = null; // foto escolhida, ainda não salva
let unsavedUpload = null; // { path, url } de uma foto enviada e ainda não salva
let cards = []; // cards de link, na ordem da tela
let deleting = false;
let drag = null; // estado do arrastar e soltar

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

// Aviso para leitores de tela
function announce(text) {
  const live = $("sr-live");
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 50);
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

// ----- Arquivos de foto no Storage -----
function storagePathFromUrl(url) {
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const i = (url || "").indexOf(marker);
  if (i === -1) return null;
  try {
    const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
    // só mexe em arquivos da própria pasta
    return path.startsWith(currentUser.id + "/") ? path : null;
  } catch {
    return null;
  }
}

async function removeStoredFile(path) {
  if (!path) return;
  const { error } = await db.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.error(error);
}

// Apaga a foto enviada que nunca chegou a ser salva no perfil
async function dropUnsavedUpload() {
  if (!unsavedUpload) return;
  const { path } = unsavedUpload;
  unsavedUpload = null;
  await removeStoredFile(path);
}

// Apaga todas as fotos da pessoa (usado ao excluir a conta)
async function deleteMyAvatarFiles() {
  try {
    const folder = db.storage.from(AVATAR_BUCKET);
    const { data } = await folder.list(currentUser.id, { limit: 100 });
    if (data && data.length) {
      await folder.remove(data.map((f) => `${currentUser.id}/${f.name}`));
    }
  } catch (err) {
    console.error(err);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem"));
    };
    img.src = url;
  });
}

// Recorta no centro, deixa quadrada e reduz (foto leve e igual para todo mundo)
async function resizeToSquare(file) {
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const out = Math.min(AVATAR_SIZE, side);

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#18181b"; // fundo para imagens com transparência
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("imagem"))),
      "image/jpeg",
      0.88,
    ),
  );
}

async function uploadAvatar(file) {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("tipo");
  if (file.size > AVATAR_MAX_INPUT) throw new Error("tamanho");

  const blob = await resizeToSquare(file);
  const path = `${currentUser.id}/${Date.now()}.jpg`;

  const { error } = await db.storage.from(AVATAR_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
  });
  if (error) throw error;

  const { data } = db.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

// ----- Foto de perfil (menu ao clicar na imagem) -----
const avatarPop = $("avatar-pop");

function openAvatarPop() {
  $("avatar-url").value = unsavedUpload ? "" : pendingAvatar || "";
  setStatus($("avatar-msg"), "", "");
  avatarPop.hidden = false;
  $("avatar-btn").setAttribute("aria-expanded", "true");
  $("avatar-upload").focus();
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

$("avatar-upload").addEventListener("click", () => $("avatar-file").click());

$("avatar-file").addEventListener("change", async () => {
  const input = $("avatar-file");
  const file = input.files[0];
  input.value = "";
  if (!file) return;

  const msg = $("avatar-msg");
  const btn = $("avatar-upload");
  btn.disabled = true;
  setStatus(msg, "Enviando...", "");

  try {
    const uploaded = await uploadAvatar(file);
    await dropUnsavedUpload(); // descarta um envio anterior que não foi salvo
    unsavedUpload = uploaded;
    pendingAvatar = uploaded.url;
    renderAvatar();
    updateProfileUI();
    closeAvatarPop(true);
  } catch (err) {
    console.error(err);
    const text =
      err.message === "tipo"
        ? "Use uma imagem PNG, JPG ou WebP."
        : err.message === "tamanho"
          ? "A imagem é grande demais (máximo 8 MB)."
          : err.message === "imagem"
            ? "Não foi possível ler essa imagem."
            : "Não foi possível enviar a imagem. Tente de novo.";
    setStatus(msg, text, "error");
  } finally {
    btn.disabled = false;
  }
});

$("avatar-apply").addEventListener("click", () => {
  const raw = $("avatar-url").value.trim();
  const url = raw ? normalizeUrl(raw) : null;

  if (raw && (!url || url.length > 2000)) {
    return setStatus($("avatar-msg"), "Esse link não é válido.", "error");
  }
  if (url !== pendingAvatar) dropUnsavedUpload();
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
  dropUnsavedUpload();
  pendingAvatar = null;
  renderAvatar();
  updateProfileUI();
  closeAvatarPop(true);
});

// ----- Salvar perfil -----
$("profile-save").addEventListener("click", async () => {
  if (!profileDirty()) return;
  const values = readProfile();
  const oldAvatar = profileBase.avatar_url;
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
  if (unsavedUpload && unsavedUpload.url === values.avatar_url)
    unsavedUpload = null;
  // a foto antiga (se estava no nosso Storage) já não é usada
  if (oldAvatar && oldAvatar !== values.avatar_url)
    removeStoredFile(storagePathFromUrl(oldAvatar));

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
const cardOf = (node) => cards.find((c) => c.el === node);

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
  cards.forEach((c) => refresh(c));
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

  // Alça de arrastar
  const handle = el("button", "drag-handle");
  handle.type = "button";
  handle.title = "Arraste para reordenar";
  handle.setAttribute(
    "aria-label",
    "Reordenar link. Arraste, ou use as setas para cima e para baixo.",
  );
  handle.append(icon("ph-dots-six-vertical"));

  const main = el("div", "lcard-main");

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

  const eye = iconOnlyBtn("Ocultar link", "ph-eye");
  const trash = iconOnlyBtn("Excluir link", "ph-trash", "danger");

  tools.append(iconBtn, featBtn, clicks, el("span", "spacer"), eye.b, trash.b);

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

  main.append(fields, tools, grid, foot);
  li.append(handle, main);

  card.refs = {
    handle,
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
    eye: eye.b,
    eyeIcon: eye.i,
    trash: trash.b,
    foot,
    status,
    save,
  };

  // Eventos dos campos
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
  eye.b.addEventListener("click", () => toggleActive(card));
  trash.b.addEventListener("click", () => removeCard(card));
  save.addEventListener("click", () => saveCard(card));

  // Arrastar e soltar (mouse, toque e caneta) + setas do teclado na alça
  handle.addEventListener("pointerdown", (e) => startDrag(card, e));
  handle.addEventListener("pointermove", (e) => {
    if (drag && drag.card === card) drag.y = e.clientY;
  });
  handle.addEventListener("pointerup", () => endDrag(card));
  handle.addEventListener("pointercancel", () => endDrag(card));
  handle.addEventListener("lostpointercapture", () => endDrag(card));
  handle.addEventListener("keydown", (e) => {
    if (card.draft) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      moveCard(card, e.key === "ArrowUp" ? -1 : 1);
    }
  });

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
  [r.handle, r.eye, r.clicks].forEach((x) => (x.hidden = card.draft));

  r.save.hidden = !dirty;
  r.foot.hidden = !(dirty || r.status.textContent);
}

function cardFlash(card, text, kind, ms) {
  flashStatus(card.refs.status, text, kind, ms, () => refresh(card));
  refresh(card);
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

  updateTotals();
  cardFlash(card, "Salvo", "ok", 2200);
}

// ----- Ordem: arrastar e soltar -----
async function persistOrder() {
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

function announcePosition(card) {
  const saved = savedCards();
  const name = card.base ? card.base.title : "Link";
  announce(
    `${name} movido para a posição ${saved.indexOf(card) + 1} de ${saved.length}.`,
  );
}

function startDrag(card, e) {
  if (card.draft || drag || e.button > 0) return;
  e.preventDefault();
  card.refs.handle.setPointerCapture(e.pointerId);

  // fecha o seletor de ícones para o card ficar menor durante o arraste
  card.refs.grid.hidden = true;
  card.refs.iconBtn.setAttribute("aria-expanded", "false");

  const rect = card.el.getBoundingClientRect();
  drag = {
    card,
    grab: e.clientY - rect.top, // onde o dedo/mouse pegou o card
    y: e.clientY,
    startOrder: savedCards()
      .map((c) => c.id)
      .join(","),
    raf: 0,
  };
  card.el.classList.add("dragging");
  document.body.classList.add("drag-active");
  drag.raf = requestAnimationFrame(dragFrame);
}

function dragFrame() {
  if (!drag) return;
  const el = drag.card.el;

  // rola a página quando o card chega perto da borda da tela
  const margin = 70;
  if (drag.y < margin) window.scrollBy(0, -14);
  else if (drag.y > window.innerHeight - margin) window.scrollBy(0, 14);

  const top = drag.y - drag.grab; // onde o card "quer" estar
  el.style.transform = "";

  // troca de lugar com os vizinhos quando passa do meio deles
  for (let guard = 0; guard < 10; guard++) {
    const height = el.getBoundingClientRect().height;
    const prev = el.previousElementSibling;
    const next = el.nextElementSibling;
    const nextCard = next && cardOf(next);

    if (prev) {
      const r = prev.getBoundingClientRect();
      if (top < r.top + r.height / 2) {
        el.parentNode.insertBefore(el, prev);
        continue;
      }
    }
    if (next && nextCard && !nextCard.draft) {
      const r = next.getBoundingClientRect();
      if (top + height > r.top + r.height / 2) {
        el.parentNode.insertBefore(next, el);
        continue;
      }
    }
    break;
  }

  // desloca o card até onde o dedo/mouse está
  const natural = el.getBoundingClientRect().top;
  el.style.transform = `translateY(${top - natural}px)`;

  drag.raf = requestAnimationFrame(dragFrame);
}

async function endDrag(card) {
  if (!drag || drag.card !== card) return;
  cancelAnimationFrame(drag.raf);

  const startOrder = drag.startOrder;
  drag = null;

  card.el.style.transform = "";
  card.el.classList.remove("dragging");
  document.body.classList.remove("drag-active");

  // a lista passa a seguir a ordem que ficou na tela
  cards = [...$("link-list").children].map(cardOf).filter(Boolean);

  if (
    savedCards()
      .map((c) => c.id)
      .join(",") !== startOrder
  ) {
    announcePosition(card);
    await persistOrder();
  }
}

// Mover pelo teclado (setas na alça)
async function moveCard(card, dir) {
  const saved = savedCards();
  const i = saved.indexOf(card);
  const j = i + dir;
  if (j < 0 || j >= saved.length) return;
  const other = saved[j];

  const parent = card.el.parentNode;
  if (dir < 0) parent.insertBefore(card.el, other.el);
  else parent.insertBefore(other.el, card.el);

  cards = [...$("link-list").children].map(cardOf).filter(Boolean);
  card.refs.handle.focus();
  announcePosition(card);
  await persistOrder();
}

// ----- Ocultar e excluir (acontecem na hora) -----
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
  updateTotals();
  updateEmpty();
}

// ===== Excluir conta (janela por cima da tela) =====
const deleteDialog = $("delete-dialog");
const deleteInput = $("delete-confirm");
const deleteBtn = $("delete-btn");
const deleteCancel = $("delete-cancel");

function confirmationMatches() {
  return (
    !!profile && deleteInput.value.trim().toLowerCase() === profile.username
  );
}

$("open-delete").addEventListener("click", () => {
  deleteInput.value = "";
  deleteInput.disabled = false;
  deleteBtn.disabled = true;
  deleteCancel.disabled = false;
  $("delete-msg").hidden = true;
  deleteDialog.showModal();
  deleteInput.focus();
});

deleteCancel.addEventListener("click", () => deleteDialog.close());

// Clicar fora da janela fecha (o clique no fundo escuro chega com a própria janela como alvo)
deleteDialog.addEventListener("click", (e) => {
  if (e.target === deleteDialog && !deleting) deleteDialog.close();
});

// Enquanto exclui, o Esc não fecha a janela
deleteDialog.addEventListener("cancel", (e) => {
  if (deleting) e.preventDefault();
});

// O botão só liga quando o nome de usuário digitado bate
deleteInput.addEventListener("input", () => {
  deleteBtn.disabled = !confirmationMatches();
});

deleteBtn.addEventListener("click", async () => {
  if (!confirmationMatches()) return;

  deleteBtn.disabled = true;
  deleteInput.disabled = true;
  deleteCancel.disabled = true;
  deleting = true;

  await deleteMyAvatarFiles(); // apaga as fotos do Storage antes de a conta sumir
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
    deleteCancel.disabled = false;
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
