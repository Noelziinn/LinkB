// ===== Elementos =====
const form = document.getElementById("auth-form");
const title = document.getElementById("auth-title");
const subtitle = document.getElementById("auth-subtitle");
const usernameField = document.getElementById("username-field");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const toggleText = document.getElementById("toggle-text");
const toggleBtn = document.getElementById("toggle-btn");
const messageBox = document.getElementById("message");
const forgotBtn = document.getElementById("forgot-btn");

let mode = "login"; // "login" | "signup"

// Nomes que conflitam com páginas do site (mantenha igual ao reserved-usernames.sql)
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
];

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
  if (msg.includes("rate limit"))
    return "Muitas tentativas. Espere um pouco e tente de novo.";
  if (msg.includes("valid email") || msg.includes("invalid email"))
    return "Digite um e-mail válido.";
  return "Algo deu errado. Tente de novo.";
}

// ===== Alternar entre login e cadastro =====
function setMode(newMode) {
  mode = newMode;
  clearMessage();

  const isSignup = mode === "signup";
  title.textContent = isSignup ? "Crie sua página" : "Entrar";
  subtitle.textContent = isSignup
    ? "Escolha seu usuário e monte seu link na bio."
    : "Acesse seu painel para editar seus links.";
  usernameField.hidden = !isSignup;
  forgotBtn.hidden = isSignup;
  usernameInput.required = isSignup;
  passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
  toggleText.textContent = isSignup ? "Já tem conta?" : "Ainda não tem conta?";
  toggleBtn.textContent = isSignup ? "Entrar" : "Criar conta";
  setLoading(false);
}

toggleBtn.addEventListener("click", () => {
  setMode(mode === "login" ? "signup" : "login");
});

// Abre direto no cadastro com login.html#cadastro
if (location.hash === "#cadastro") setMode("signup");

// ===== Envio do formulário =====
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

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

      if (RESERVED_USERNAMES.includes(username)) {
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
          data: { username }, // o trigger do banco cria o perfil com esse valor
          emailRedirectTo: new URL("dashboard.html", location.href).href,
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
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "dashboard.html";
    }
  } catch (error) {
    console.error(error);
    showMessage(translateError(error));
  } finally {
    setLoading(false);
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

  forgotBtn.disabled = true;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("reset-password.html", location.href).href,
  });
  forgotBtn.disabled = false;

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
