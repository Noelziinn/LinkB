const $ = (id) => document.getElementById(id);

let currentUser = null;
let profile = null;
let links = [];
let editingId = null;

const MAX_LINKS = 30; // mantenha igual ao limite do limits.sql

// ===== Utilidades =====
function showMsg(el, text, type = "success") {
  el.textContent = text;
  el.className = "message " + type;
  el.hidden = false;
  if (type === "success") setTimeout(() => (el.hidden = true), 2500);
}

function normalizeUrl(value) {
  let url = value.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

async function logout() {
  await db.auth.signOut();
  window.location.href = "login.html";
}

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
  $("public-link").href = "u.html?user=" + encodeURIComponent(profile.username);
  $("display_name").value = profile.display_name || "";
  $("bio").value = profile.bio || "";
  $("avatar_url").value = profile.avatar_url || "";
  $("accent_color").value = profile.accent_color || "#6366f1";
}

$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("profile-btn");
  const avatarRaw = $("avatar_url").value.trim();
  const avatar = avatarRaw ? normalizeUrl(avatarRaw) : null;

  if (avatarRaw && !avatar) {
    return showMsg($("profile-msg"), "O link da foto não é válido.", "error");
  }

  btn.disabled = true;
  const { error } = await db
    .from("profiles")
    .update({
      display_name: $("display_name").value.trim() || null,
      bio: $("bio").value.trim() || null,
      avatar_url: avatar,
      accent_color: $("accent_color").value,
    })
    .eq("id", currentUser.id);
  btn.disabled = false;

  if (error) {
    console.error(error);
    return showMsg(
      $("profile-msg"),
      "Não foi possível salvar. Tente de novo.",
      "error",
    );
  }
  showMsg($("profile-msg"), "Perfil salvo.");
});

// ===== Links =====
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
  links = data;
  renderLinks();
}

function renderLinks() {
  const list = $("link-list");
  list.replaceChildren();

  if (links.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent =
      "Você ainda não tem links. Adicione o primeiro no formulário acima.";
    list.append(li);
    return;
  }

  links.forEach((link, index) => {
    const li = document.createElement("li");
    li.className =
      "link-item" +
      (link.active ? "" : " inactive") +
      (link.id === editingId ? " editing" : "");

    // Linha principal
    const main = document.createElement("div");
    main.className = "link-main";

    const icon = document.createElement("i");
    icon.className = "ph " + (link.icon || "ph-link");

    const info = document.createElement("div");
    info.className = "link-info";
    const title = document.createElement("strong");
    title.textContent = link.title;
    const url = document.createElement("small");
    url.textContent = link.url;
    info.append(title, url);

    main.append(icon, info);

    if (link.featured) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Destaque";
      main.append(badge);
    }

    // Ferramentas
    const tools = document.createElement("div");
    tools.className = "link-tools";

    const up = makeBtn("Subir", "Mover para cima", () => moveLink(index, -1));
    up.disabled = index === 0;
    const down = makeBtn("Descer", "Mover para baixo", () =>
      moveLink(index, 1),
    );
    down.disabled = index === links.length - 1;
    const edit = makeBtn("Editar", "Editar link", () => startEdit(link));
    const del = makeBtn("Excluir", "Excluir link", () => deleteLink(link));
    del.classList.add("danger");

    const visible = document.createElement("label");
    visible.className = "check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = link.active;
    checkbox.addEventListener("change", () =>
      toggleActive(link, checkbox.checked),
    );
    const label = document.createElement("span");
    label.textContent = "Visível";
    visible.append(checkbox, label);

    tools.append(up, down, edit, del, visible);
    li.append(main, tools);
    list.append(li);
  });
}

function makeBtn(text, ariaLabel, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn-ghost";
  b.textContent = text;
  b.setAttribute("aria-label", ariaLabel);
  b.addEventListener("click", onClick);
  return b;
}

// ----- Adicionar / editar -----
$("link-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("link-msg");

  const title = $("link-title").value.trim();
  const url = normalizeUrl($("link-url").value);

  if (!title) return showMsg(msg, "Dê um título ao link.", "error");
  if (!url) return showMsg(msg, "O endereço do link não é válido.", "error");
  if (url.length > 2000)
    return showMsg(msg, "O endereço do link é muito longo.", "error");
  if (!editingId && links.length >= MAX_LINKS) {
    return showMsg(
      msg,
      `Você chegou ao limite de ${MAX_LINKS} links. Exclua algum para adicionar outro.`,
      "error",
    );
  }

  const payload = {
    title,
    subtitle: $("link-subtitle").value.trim() || null,
    url,
    icon: $("link-icon").value,
    featured: $("link-featured").checked,
  };

  $("link-btn").disabled = true;
  let error;

  if (editingId) {
    ({ error } = await db.from("links").update(payload).eq("id", editingId));
  } else {
    ({ error } = await db
      .from("links")
      .insert({
        ...payload,
        profile_id: currentUser.id,
        position: links.length,
      }));
  }
  $("link-btn").disabled = false;

  if (error) {
    console.error(error);
    if ((error.message || "").includes("LINK_LIMIT_REACHED")) {
      return showMsg(
        msg,
        `Você chegou ao limite de ${MAX_LINKS} links.`,
        "error",
      );
    }
    return showMsg(
      msg,
      "Não foi possível salvar o link. Tente de novo.",
      "error",
    );
  }

  const wasEditing = !!editingId;
  resetLinkForm();
  await loadLinks();
  showMsg(msg, wasEditing ? "Link atualizado." : "Link adicionado.");
});

function startEdit(link) {
  editingId = link.id;
  $("link-title").value = link.title;
  $("link-subtitle").value = link.subtitle || "";
  $("link-url").value = link.url;
  $("link-icon").value = link.icon || "ph-link";
  $("link-featured").checked = link.featured;
  $("link-form-title").textContent = "Editar link";
  $("link-btn").textContent = "Salvar alterações";
  $("link-cancel").hidden = false;
  renderLinks();
  $("link-form-title").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetLinkForm() {
  editingId = null;
  $("link-form").reset();
  $("link-form-title").textContent = "Adicionar link";
  $("link-btn").textContent = "Adicionar link";
  $("link-cancel").hidden = true;
}

$("link-cancel").addEventListener("click", () => {
  resetLinkForm();
  renderLinks();
});

// ----- Excluir, ocultar, reordenar -----
async function deleteLink(link) {
  if (!confirm(`Excluir o link "${link.title}"?`)) return;
  const { error } = await db.from("links").delete().eq("id", link.id);
  if (error) {
    console.error(error);
    return showMsg($("link-msg"), "Não foi possível excluir.", "error");
  }
  if (editingId === link.id) resetLinkForm();
  await loadLinks();
}

async function toggleActive(link, active) {
  const { error } = await db.from("links").update({ active }).eq("id", link.id);
  if (error) {
    console.error(error);
    showMsg($("link-msg"), "Não foi possível atualizar.", "error");
  }
  await loadLinks();
}

async function moveLink(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= links.length) return;

  [links[index], links[target]] = [links[target], links[index]];
  renderLinks(); // atualiza a tela na hora

  const results = await Promise.all(
    links.map((l, i) =>
      db.from("links").update({ position: i }).eq("id", l.id),
    ),
  );
  if (results.some((r) => r.error)) {
    showMsg($("link-msg"), "Não foi possível salvar a nova ordem.", "error");
    await loadLinks();
  }
}

// ===== Sair =====
$("logout-btn").addEventListener("click", logout);

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

  const { error } = await db.rpc("delete_my_account");

  if (error) {
    console.error(error);
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

init();
