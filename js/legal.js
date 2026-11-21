// Preenche o e-mail de contato nas páginas de Termos e Privacidade
// (arquivo separado para as páginas não precisarem de script dentro do HTML)
document.querySelectorAll("[data-contact-email]").forEach((el) => {
  el.textContent = CONTACT_EMAIL;
  el.href = "mailto:" + CONTACT_EMAIL;
});
