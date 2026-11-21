const $ = (id) => document.getElementById(id);

const form = $("username-form");
const input = $("username");
const termsInput = $("terms");
const submitBtn = $("submit-btn");
const messageBox = $("message");

let me = null;

const isReserved = (name) =>
  (typeof RESERVED_USERNAMES !== "undefined"
    ? RESERVED_USERNAMES
    : []
  ).includes(name);

function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = "message " + type;
  messageBox.hidden = false;
}

// Transforma um nome qualquer em algo que cabe no formato de usuário
function slugify(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30);
}

async function init() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
    return;
  }
  me = data.session.user;

  const { data: profile } = await db
    .from("profiles")
    .select("username_set")
    .eq("id", me.id)
    .maybeSingle();

  // Quem já escolheu (ou não tem perfil) não precisa estar aqui
  if (!profile || profile.username_set !== false) {
    window.location.href = "dashboard.html";
    return;
  }

  // Sugestão a partir do que o Google/GitHub informou
  const meta = me.user_metadata || {};
  const suggestion = slugify(
    meta.user_name ||
      meta.preferred_username ||
      meta.full_name ||
      meta.name ||
      (me.email || "").split("@")[0],
  );
  if (suggestion.length >= 3 && !isReserved(suggestion))
    input.value = suggestion;

  $("app").hidden = false;
  input.focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageBox.hidden = true;

  const username = input.value.trim().toLowerCase();

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return showMessage(
      "Usuário: de 3 a 30 caracteres, só letras minúsculas, números e _.",
    );
  }
  if (isReserved(username)) {
    return showMessage("Esse nome de usuário não está disponível.");
  }
  if (!termsInput.checked) {
    return showMessage(
      "Para continuar, aceite os Termos de Uso e a Política de Privacidade.",
    );
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Aguarde...";

  const reset = () => {
    submitBtn.disabled = false;
    submitBtn.textContent = "Continuar";
  };

  // Já existe alguém com esse nome?
  const { data: taken, error: checkError } = await db
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", me.id)
    .maybeSingle();

  if (checkError) {
    console.error(checkError);
    reset();
    return showMessage("Não foi possível verificar o nome. Tente de novo.");
  }
  if (taken) {
    reset();
    return showMessage("Esse nome de usuário já está em uso.");
  }

  const { error } = await db
    .from("profiles")
    .update({ username, username_set: true })
    .eq("id", me.id);

  if (error) {
    console.error(error);
    reset();
    if (error.code === "23505")
      return showMessage("Esse nome de usuário já está em uso.");
    if (error.code === "23514")
      return showMessage("Esse nome de usuário não está disponível.");
    return showMessage("Não foi possível salvar. Tente de novo.");
  }

  // Registra o aceite dos termos (se falhar, não impede de seguir)
  const { error: metaError } = await db.auth.updateUser({
    data: { terms_accepted_at: new Date().toISOString() },
  });
  if (metaError) console.error(metaError);

  window.location.href = "dashboard.html";
});

init();
