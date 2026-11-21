// ===== Elementos =====
const form = document.getElementById("auth-form");
const title = document.getElementById("auth-title");
const subtitle = document.getElementById("auth-subtitle");
const usernameField = document.getElementById("username-field");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const messageBox = document.getElementById("message");
const forgotBtn = document.getElementById("forgot-btn");
const termsField = document.getElementById("terms-field");
const termsInput = document.getElementById("terms");
const socialBox = document.getElementById("social-box");
const pwToggle = document.getElementById("pw-toggle");

let mode = "login"; // "login" | "signup"

const PROVIDER_LABELS = { google: "Google", github: "GitHub" };

// Estes valores vêm do config.js (com proteção caso ainda não existam lá)
const enabledProviders = () =>
  typeof ENABLED_PROVIDERS !== "undefined" ? ENABLED_PROVIDERS : [];
const isReserved = (name) =>
  (typeof RESERVED_USERNAMES !== "undefined"
    ? RESERVED_USERNAMES
    : []
  ).includes(name);

// ===== CAPTCHA (Cloudflare Turnstile) =====
let captchaToken = null;
let captchaWidgetId = null;

// O script do Turnstile chama esta função quando termina de carregar
window.onloadTurnstileCallback = () => {
  if (!TURNSTILE_SITE_KEY) return;
  captchaWidgetId = turnstile.render("#captcha", {
    sitekey: TURNSTILE_SITE_KEY,
    theme: "dark",
    callback: (token) => {
      captchaToken = token;
    },
    "expired-callback": () => {
      captchaToken = null;
    },
    "error-callback": () => {
      captchaToken = null;
    },
  });
};

// Cada token só vale uma vez, então renovamos depois de cada tentativa
function resetCaptcha() {
  captchaToken = null;
  if (captchaWidgetId !== null && window.turnstile)
    turnstile.reset(captchaWidgetId);
}

// ===== Utilidades =====
function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = "message " + type;
  messageBox.hidden = false;
}

function clearMessage() {
  messageBox.hidden = true;
  messageBox.textContent = "";
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading
    ? "Aguarde..."
    : mode === "login"
      ? "Entrar"
      : "Criar conta";
}

function translateError(error) {
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("invalid login credentials"))
    return "E-mail ou senha incorretos.";
  if (msg.includes("already registered"))
    return "Esse e-mail já tem conta. Tente entrar.";
  if (msg.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("password should be at least"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("signups not allowed"))
    return "Os cadastros estão temporariamente fechados.";
  if (msg.includes("captcha"))
    return "Não foi possível verificar que você não é um robô. Tente de novo.";
  if (msg.includes("rate limit"))
    return "Muitas tentativas. Espere um pouco e tente de novo.";
  if (msg.includes("valid email") || msg.includes("invalid email"))
    return "Digite um e-mail válido.";
  return "Algo deu errado. Tente de novo.";
}

// Retorna true se pode seguir; senão mostra o aviso
function captchaOk() {
  if (TURNSTILE_SITE_KEY && !captchaToken) {
    showMessage("Aguarde a verificação de segurança terminar e tente de novo.");
    return false;
  }
  return true;
}

// ===== Alternar entre login e cadastro (abas) =====
function setMode(newMode) {
  mode = newMode;
  clearMessage();

  const isSignup = mode === "signup";
  title.textContent = isSignup ? "Crie sua página" : "Bem-vindo de volta";
  subtitle.textContent = isSignup
    ? "Escolha seu usuário e monte seu link na bio."
    : "Acesse seu painel para editar seus links.";

  tabLogin.classList.toggle("active", !isSignup);
  tabSignup.classList.toggle("active", isSignup);
  tabLogin.setAttribute("aria-pressed", String(!isSignup));
  tabSignup.setAttribute("aria-pressed", String(isSignup));

  usernameField.hidden = !isSignup;
  usernameInput.required = isSignup;
  forgotBtn.hidden = isSignup;
  termsField.hidden = !isSignup;
  passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
  setLoading(false);
}

tabLogin.addEventListener("click", () => setMode("login"));
tabSignup.addEventListener("click", () => setMode("signup"));

// Abre direto no cadastro com login.html#cadastro
if (location.hash === "#cadastro") setMode("signup");

// Aviso depois de excluir a conta
if (new URLSearchParams(location.search).get("conta") === "excluida") {
  showMessage("Sua conta foi excluída com sucesso.", "success");
}

// ===== Mostrar / ocultar senha =====
pwToggle.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  pwToggle.setAttribute("aria-pressed", String(show));
  pwToggle.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
  pwToggle.firstElementChild.className =
    "ph " + (show ? "ph-eye-slash" : "ph-eye");
});

// ===== Entrar com Google / GitHub =====
async function signInWithProvider(provider, button) {
  clearMessage();
  button.disabled = true;

  const { error } = await db.auth.signInWithOAuth({
    provider,
    options: { redirectTo: new URL("dashboard.html", location.href).href },
  });

  // Se deu certo, o navegador já está indo para a página do provedor
  if (error) {
    console.error(error);
    showMessage(
      `Não foi possível entrar com ${PROVIDER_LABELS[provider]}. Tente de novo.`,
    );
    button.disabled = false;
  }
}

(function setupSocialButtons() {
  const active = enabledProviders().filter((p) => PROVIDER_LABELS[p]);
  document.querySelectorAll("[data-provider]").forEach((button) => {
    button.hidden = !active.includes(button.dataset.provider);
    button.addEventListener("click", () =>
      signInWithProvider(button.dataset.provider, button),
    );
  });
  socialBox.hidden = active.length === 0;
})();

// ===== Envio do formulário (e-mail e senha) =====
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (mode === "signup" && !termsInput.checked) {
    showMessage(
      "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.",
    );
    return;
  }
  if (!captchaOk()) return;

  const captchaOpt = captchaToken ? { captchaToken } : {};

  setLoading(true);

  try {
    if (mode === "signup") {
      const username = usernameInput.value.trim().toLowerCase();

      if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        showMessage(
          "Usuário: de 3 a 30 caracteres, só letras minúsculas, números e _.",
        );
        return;
      }

      if (isReserved(username)) {
        showMessage("Esse nome de usuário não está disponível.");
        return;
      }

      // Verifica se o usuário já existe (perfis são públicos para leitura)
      const { data: existing, error: checkError } = await db
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existing) {
        showMessage("Esse nome de usuário já está em uso.");
        return;
      }

      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          // o trigger do banco cria o perfil com o username
          data: { username, terms_accepted_at: new Date().toISOString() },
          emailRedirectTo: new URL("dashboard.html", location.href).href,
          ...captchaOpt,
        },
      });

      if (error) throw error;

      if (data.session) {
        window.location.href = "dashboard.html";
      } else {
        showMessage(
          "Conta criada! Confira seu e-mail para confirmar o cadastro.",
          "success",
        );
      }
    } else {
      const { error } = await db.auth.signInWithPassword({
        email,
        password,
        options: captchaOpt,
      });
      if (error) throw error;
      window.location.href = "dashboard.html";
    }
  } catch (error) {
    console.error(error);
    showMessage(translateError(error));
  } finally {
    setLoading(false);
    resetCaptcha();
  }
});

// ===== Esqueci minha senha =====
forgotBtn.addEventListener("click", async () => {
  clearMessage();
  const email = emailInput.value.trim();

  if (!email) {
    showMessage(
      'Digite seu e-mail acima e clique de novo em "Esqueci minha senha".',
    );
    emailInput.focus();
    return;
  }
  if (!captchaOk()) return;

  const captchaOpt = captchaToken ? { captchaToken } : {};

  forgotBtn.disabled = true;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("reset-password.html", location.href).href,
    ...captchaOpt,
  });
  forgotBtn.disabled = false;
  resetCaptcha();

  if (error) {
    console.error(error);
    showMessage(translateError(error));
    return;
  }

  // Mesma resposta exista a conta ou não (não revela quem tem cadastro)
  showMessage(
    "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Confira também o spam.",
    "success",
  );
});

// ===== Se já estiver logado, vai direto pro painel =====
(async () => {
  const { data } = await db.auth.getSession();
  if (data.session) window.location.href = "dashboard.html";
})();

// ===== Logout (usado pelo dashboard) =====
async function logout() {
  await db.auth.signOut();
  window.location.href = "login.html";
}
