// Se a pessoa já estiver logada, os botões levam direto ao painel
(async () => {
  const { data } = await db.auth.getSession();
  if (!data.session) return;

  document.querySelectorAll(".cta-main").forEach((a) => {
    a.href = "dashboard.html";
    a.textContent = "Ir para o meu painel";
  });
  document.querySelectorAll(".cta-second, .cta-hint").forEach((el) => {
    el.hidden = true;
  });
})();
