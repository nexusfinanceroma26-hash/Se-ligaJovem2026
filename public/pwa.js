(function setupNexFinancePwa() {
  let deferredInstallPrompt = null;

  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function createInstallBanner(force = false) {
    if (isStandalone() || document.querySelector(".pwa-install")) return null;
    if (!force && !isIos && !deferredInstallPrompt) return null;

    const banner = document.createElement("div");
    banner.className = "pwa-install pwa-install-platforms";
    banner.innerHTML = `
      <div class="pwa-install-copy">
        <strong>Instalar NexFinance</strong>
        <span>Disponível para Android, iPhone e notebook como app PWA.</span>
      </div>
      <div class="pwa-install-actions">
        <button class="pwa-install-android" type="button">${isAndroid ? "Instalar no Android" : "Android / Notebook"}</button>
        <button class="pwa-install-ios" type="button">iPhone</button>
      </div>
      <button class="pwa-install-close" type="button" aria-label="Fechar">×</button>
    `;

    banner.querySelector(".pwa-install-android").addEventListener("click", installOnAndroid);
    banner.querySelector(".pwa-install-ios").addEventListener("click", showIosInstructions);
    banner.querySelector(".pwa-install-close").addEventListener("click", () => {
      sessionStorage.setItem("nexfinance_install_closed", "1");
      banner.classList.remove("show");
    });

    document.body.append(banner);
    return banner;
  }

  async function installOnAndroid() {
    if (!deferredInstallPrompt) {
      showInstallHelp("Android / Notebook", "No Chrome, toque no menu do navegador e escolha Instalar app ou Adicionar à tela inicial.");
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.querySelector(".pwa-install")?.classList.remove("show");
  }

  function showIosInstructions() {
    showInstallHelp("Instalar no iPhone", "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. O iPhone instala como app PWA, não como APK.");
  }

  function showInstallHelp(title, message) {
    const existing = document.querySelector(".pwa-install-help");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.className = "pwa-install-help";
    modal.innerHTML = `
      <div class="pwa-install-help-card" role="dialog" aria-modal="true" aria-label="${title}">
        <button type="button" aria-label="Fechar">×</button>
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
    `;

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.tagName === "BUTTON") modal.remove();
    });

    document.body.append(modal);
  }

  function showBannerWhenUseful(force = false) {
    if (sessionStorage.getItem("nexfinance_install_closed") === "1" && !force) return;
    const banner = createInstallBanner(force);
    if (banner) banner.classList.add("show");
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
    showBannerWhenUseful(true);
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelector(".pwa-install")?.classList.remove("show");
  });

  window.addEventListener("load", () => {
    if (isIos) {
      setTimeout(() => showBannerWhenUseful(true), 900);
    }
  });

  window.NexFinanceInstall = {
    open: () => showBannerWhenUseful(true),
    ios: showIosInstructions,
    android: installOnAndroid,
  };
})();
