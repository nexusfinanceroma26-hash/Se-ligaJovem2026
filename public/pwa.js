(function setupNexFinancePwa() {
  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function createInstallBanner() {
    if (isStandalone() || document.querySelector(".pwa-install")) return null;

    const banner = document.createElement("div");
    banner.className = "pwa-install";
    banner.innerHTML = `
      <div>
        <strong>Instalar NexFinance</strong>
        <span>Use como app no celular, tablet ou notebook.</span>
      </div>
      <button type="button">Instalar</button>
    `;

    banner.querySelector("button").addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      banner.classList.remove("show");
    });

    document.body.append(banner);
    return banner;
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("PWA indisponivel neste ambiente:", error);
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const banner = createInstallBanner();
    if (banner) banner.classList.add("show");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelector(".pwa-install")?.classList.remove("show");
  });
})();
