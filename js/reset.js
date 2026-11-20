const $ = (id) => document.getElementById(id);

const form = $("reset-form");
const subtitle = $("reset-subtitle");
const messageBox = $("message");
const submitBtn = $("submit-btn");

let recovering = false;

function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = "message " + type;
  messageBox.hidden = false;
}

function translateError(error) {
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("different from the old password"))
    return "A nova senha precisa ser diferente da atual.";
  if (msg.includes("password should be at least"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("weak"))
    return "Essa senha é fraca demais. Tente uma mais difícil.";
  if (msg.includes("session"))
    return "O link expirou. Peça um novo na tela de login.";
  return "Não foi possível alterar a senha. Tente de novo.";
}

function showForm() {
  if (recovering) return;
  recovering = true;
  subtitle.textContent = "Escolha uma nova senha para a sua conta.";
  form.hidden = false;
  $("back").hidden = true;
  $("password").focus();
}

function showInvalid() {
  if (recovering) return;
  subtitle.textContent =
    "Este link é inválido ou expirou. Peça um novo na tela de login.";
  $("back").hidden = false;
}

// O Supabase avisa com o evento PASSWORD_RECOVERY quando o link do e-mail é válido
db.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showForm();
});

// Link com erro (ex.: expirado) volta com "error" na URL
if (location.hash.includes("error")) {
  showInvalid();
} else {
  // Se nada acontecer, a pessoa abriu a página sem um link válido
  setTimeout(showInvalid, 4000);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageBox.hidden = true;

  const password = $("password").value;
  const confirm = $("confirm").value;

  if (password.length < 6) {
    return showMessage("A senha precisa ter pelo menos 6 caracteres.");
  }
  if (password !== confirm) {
    return showMessage("As senhas não são iguais.");
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Aguarde...";

  const { error } = await db.auth.updateUser({ password });

  if (error) {
    console.error(error);
    showMessage(translateError(error));
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar nova senha";
    return;
  }

  showMessage("Senha alterada! Redirecionando para o painel...", "success");
  setTimeout(() => (window.location.href = "dashboard.html"), 1500);
});
