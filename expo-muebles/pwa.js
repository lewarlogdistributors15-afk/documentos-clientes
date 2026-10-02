(() => {
  const installButton = document.getElementById("install-app");
  const installedLabel = document.getElementById("app-installed");
  let deferredPrompt = null;

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (standalone && installedLabel) installedLabel.hidden = false;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .catch(error => console.warn("Service worker:", error));
    });
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  if (installButton) {
    installButton.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") installButton.hidden = true;
        deferredPrompt = null;
        return;
      }

      const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isiOS) {
        alert("En iPhone/iPad: toca Compartir y luego «Añadir a pantalla de inicio».");
      } else {
        alert("Abre el menú del navegador y selecciona «Instalar app» o «Añadir a pantalla de inicio».");
      }
    });
  }

  window.addEventListener("appinstalled", () => {
    if (installButton) installButton.hidden = true;
    if (installedLabel) installedLabel.hidden = false;
  });
})();