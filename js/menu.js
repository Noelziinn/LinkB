// Menu lateral (três pontinhos). Precisa do supabase.js carregado antes.
(() => {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  const icon = (name) => {
    const i = el("i", "ph " + name);
    i.setAttribute("aria-hidden", "true");
    return i;
  };

  const menuLink = (href, iconName, label, extraClass = "") => {
    const a = el("a", "menu-item " + extraClass);
    a.href = href;
    a.append(icon(iconName), el("span", "", label));
    return a;
  };

  // ===== Estrutura fixa =====
  const toggle = el("button", "menu-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Abrir menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "side-menu");
  toggle.append(icon("ph-dots-three-vertical"));

  const overlay = el("div", "menu-overlay");

  const panel = el("aside", "side-menu");
  panel.id = "side-menu";
  panel.setAttribute("aria-label", "Menu");
  panel.inert = true;

  const head = el("div", "menu-head");
  const closeBtn = el("button", "menu-close");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Fechar menu");
  closeBtn.append(icon("ph-x"));
  head.append(el("span", "", "Menu"), closeBtn);

  const userBox = el("div");
  const nav = el("nav", "menu-nav");
  panel.append(head, userBox, nav);

  document.body.append(toggle, overlay, panel);

  // ===== Abrir e fechar =====
  function openMenu() {
    panel.inert = false;
    panel.classList.add("open");
    overlay.classList.add("open");
    document.body.classList.add("menu-open");
    toggle.setAttribute("aria-expanded", "true");
    closeBtn.focus();
  }

  function closeMenu(returnFocus = true) {
    panel.classList.remove("open");
    overlay.classList.remove("open");
    document.body.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
    panel.inert = true;
    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", openMenu);
  closeBtn.addEventListener("click", () => closeMenu());
  overlay.addEventListener("click", () => closeMenu());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closeMenu();
  });

  // ===== Conteúdo conforme o login =====
  function makeAvatar(profile) {
    const name = profile.display_name || profile.username;

    const fallback = () => {
      const d = el(
        "div",
        "menu-avatar menu-avatar-fallback",
        name.trim().charAt(0).toUpperCase() || "?",
      );
      return d;
    };

    if (profile.avatar_url && /^https?:\/\//i.test(profile.avatar_url)) {
      const img = el("img", "menu-avatar");
      img.alt = "";
      img.src = profile.avatar_url;
      img.addEventListener("error", () => img.replaceWith(fallback()));
      return img;
    }
    return fallback();
  }

  let renderToken = 0;

  async function render(session) {
    const token = ++renderToken;
    userBox.replaceChildren();
    nav.replaceChildren();

    if (!session) {
      userBox.append(
        el("p", "menu-hint", "Entre para criar e gerenciar o seu link na bio."),
      );
      nav.append(
        menuLink("login.html", "ph-sign-in", "Entrar", "primary"),
        menuLink("login.html#cadastro", "ph-user-plus", "Criar conta"),
      );
      return;
    }

    const { data: profile } = await db
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", session.user.id)
      .maybeSingle();

    if (token !== renderToken) return; // chegou uma atualização mais nova

    if (profile) {
      const card = el("div", "menu-user");
      const text = el("div", "menu-user-text");
      text.append(
        el("strong", "", profile.display_name || profile.username),
        el("span", "", "@" + profile.username),
      );
      card.append(makeAvatar(profile), text);
      userBox.append(card);
    } else {
      userBox.append(el("p", "menu-hint", session.user.email || ""));
    }

    nav.append(
      menuLink("dashboard.html", "ph-squares-four", "Meu painel", "primary"),
    );

    if (profile) {
      nav.append(
        menuLink(
          "u.html?user=" + encodeURIComponent(profile.username),
          "ph-user-circle",
          "Ver minha página",
        ),
      );
    }

    const logoutBtn = el("button", "menu-item danger");
    logoutBtn.type = "button";
    logoutBtn.append(icon("ph-sign-out"), el("span", "", "Sair"));
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      await db.auth.signOut();
      closeMenu(false);
      toggle.focus();
    });
    nav.append(logoutBtn);
  }

  // Estado inicial
  db.auth.getSession().then(({ data }) => render(data.session));

  // Mudanças depois (login, logout em outra aba)
  db.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    // setTimeout evita travar o cliente do Supabase dentro do callback
    setTimeout(() => render(session), 0);
  });
})();
