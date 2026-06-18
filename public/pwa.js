(function setupNexFinancePwa() {
  let deferredInstallPrompt = null;
  const COOKIE_CONSENT_KEY = "nexfinance_cookie_consent";

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
    showCookieConsent();
  });

  window.NexFinanceInstall = {
    open: () => showBannerWhenUseful(true),
    ios: showIosInstructions,
    android: installOnAndroid,
  };

  function showCookieConsent() {
    if (localStorage.getItem(COOKIE_CONSENT_KEY) || document.querySelector(".cookie-consent")) return;

    const banner = document.createElement("section");
    banner.className = "cookie-consent";
    banner.setAttribute("aria-label", "Aviso de cookies");
    banner.innerHTML = `
      <div class="cookie-consent-copy">
        <strong>Cookies da NexFinance</strong>
        <span>Usamos cookies essenciais para manter sua sessão segura e melhorar a experiência no app. Veja a <a href="privacidade.html">Política de Privacidade</a> e a página de <a href="lgpd.html">LGPD</a>.</span>
      </div>
      <div class="cookie-consent-actions">
        <button class="cookie-consent-secondary" type="button" data-cookie-choice="necessary">Usar apenas essenciais</button>
        <button class="cookie-consent-primary" type="button" data-cookie-choice="accepted">Aceitar cookies</button>
      </div>
    `;

    banner.querySelectorAll("[data-cookie-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
          choice: button.dataset.cookieChoice,
          acceptedAt: new Date().toISOString(),
        }));
        banner.classList.remove("show");
        setTimeout(() => banner.remove(), 240);
      });
    });

    document.body.append(banner);
    requestAnimationFrame(() => banner.classList.add("show"));
  }
})();

