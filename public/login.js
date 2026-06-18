document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#loginForm");
  const emailInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const messageBox = document.querySelector("#loginMessage");
  const submitButton = loginForm?.querySelector("button[type='submit']");
  const googleButton = document.querySelector(".btn-google");
  const googleMount = document.querySelector("#googleSignInMount");

  let googleClientReady = false;
  let pendingGoogleProfile = null;

  if (!loginForm) {
    console.error("Formulário #loginForm não encontrado.");
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    clearMessage();

    if (!email || !password) {
      showMessage("Preencha o e-mail e a senha.", "error");
      return;
    }

    loginWithCredentials(email, password, {
      button: submitButton,
      loadingText: "Entrando...",
      defaultText: "Entrar",
    });
  });

  googleButton?.addEventListener("click", () => {
    clearMessage();

    if (!googleClientReady || !window.google?.accounts?.id) {
      showMessage("Google Login ainda não está configurado. Coloque o GOOGLE_CLIENT_ID no .env e reinicie o servidor.", "error");
      return;
    }

    setLoading(googleButton, true, "Abrindo Google...");
    window.google.accounts.id.prompt((notification) => {
      setLoading(googleButton, false, "Continuar com Google");
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        showMessage("Não foi possível abrir o seletor do Google. Tente novamente ou entre com e-mail e senha.", "error");
      }
    });
  });

  initGoogleLogin();

  async function initGoogleLogin() {
    try {
      const response = await fetch("/api/auth/google/config");
      const data = await response.json();

      if (!data.clientId || data.clientId.includes("cole_o_client_id")) {
        googleClientReady = false;
        googleButton?.classList.remove("is-hidden");
        return;
      }

      await waitForGoogleScript();

      window.google.accounts.id.initialize({
        client_id: data.clientId,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
        itp_support: true,
      });

      renderGoogleButton();
      googleClientReady = true;
    } catch (error) {
      console.error("Erro ao inicializar Google Login:", error);
      googleClientReady = false;
      googleButton?.classList.remove("is-hidden");
    }
  }

  function renderGoogleButton() {
    if (!googleMount || !window.google?.accounts?.id) {
      googleButton?.classList.remove("is-hidden");
      return;
    }

    googleMount.innerHTML = "";

    try {
      const buttonWidth = Math.min(400, Math.max(260, googleMount.clientWidth || 360));

      window.google.accounts.id.renderButton(googleMount, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: buttonWidth,
      });

      googleButton?.classList.add("is-hidden");
      googleMount.classList.add("is-ready");
    } catch (error) {
      console.error("Erro ao renderizar botao oficial do Google:", error);
      googleButton?.classList.remove("is-hidden");
    }
  }

  function waitForGoogleScript() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (window.google?.accounts?.id) {
          clearInterval(timer);
          resolve();
        }

        if (attempts > 50) {
          clearInterval(timer);
          reject(new Error("Script do Google não carregou."));
        }
      }, 100);
    });
  }

  async function handleGoogleCredential(response) {
    clearMessage();
    setLoading(googleButton, true, "Verificando...");

    try {
      const result = await fetch("/api/auth/google", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credential: response.credential,
        }),
      });

      const data = await result.json();

      if (!result.ok || !data.success) {
        showMessage(data.message || "Não foi possível validar sua conta Google.", "error");
        return;
      }

      if (data.requiresPassword) {
        pendingGoogleProfile = data;
        openGooglePasswordStep(data.profile);
        showMessage("Conta Google verificada. Crie uma senha para concluir o cadastro.", "success");
        return;
      }

      finishLogin(data);
    } catch (error) {
      console.error("Erro no login com Google:", error);
      showMessage("Não foi possível conectar ao Google agora.", "error");
    } finally {
      setLoading(googleButton, false, "Continuar com Google");
    }
  }

  async function completeGoogleSignup(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const company = form.company.value.trim();
    const password = form.password.value.trim();
    const confirmPassword = form.confirmPassword.value.trim();

    if (!company || !password || !confirmPassword) {
      showMessage("Preencha empresa, senha e confirmação.", "error");
      return;
    }

    if (password.length !== 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      showMessage("A senha precisa ter exatamente 8 caracteres, com letras e números.", "error");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("As senhas não conferem.", "error");
      return;
    }

    const button = form.querySelector("button[type='submit']");
    setLoading(button, true, "Criando conta...");

    try {
      const response = await fetch("/api/auth/google/complete", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileToken: pendingGoogleProfile.profileToken,
          company,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showMessage(data.message || "Não foi possível concluir o cadastro com Google.", "error");
        return;
      }

      closeGooglePasswordStep();
      finishLogin(data);
    } catch (error) {
      console.error("Erro ao concluir cadastro Google:", error);
      showMessage("Não foi possível criar a conta com Google agora.", "error");
    } finally {
      setLoading(button, false, "Criar conta");
    }
  }

  async function loginWithCredentials(email, password, options = {}) {
    const { button, loadingText, defaultText, allowDemoFallback = false } = options;
    setLoading(button, true, loadingText);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const contentType = response.headers.get("content-type");

      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Resposta não JSON:", text);
        if (allowDemoFallback) {
          startDemoSession("Acesso de demonstração iniciado.");
        } else {
          showMessage("Erro: o servidor não retornou JSON.", "error");
        }
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        showMessage(data.message || "E-mail ou senha incorretos.", "error");
        return;
      }

      finishLogin(data);
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      if (allowDemoFallback || isDemoCredential(email, password)) {
        startDemoSession("Servidor indisponível. Entrando em modo apresentação.");
      } else {
        showMessage("Não foi possível conectar ao servidor.", "error");
      }
    } finally {
      setLoading(button, false, defaultText);
    }
  }

  function finishLogin(data) {
    localStorage.removeItem("nexfinance_token");
    sessionStorage.setItem("nexfinance_user", JSON.stringify(data.user));

    const profileKey = getInvestorProfileKey(data.user);
    const hasInvestorProfile = Boolean(localStorage.getItem(profileKey));
    const nextPage = hasInvestorProfile ? "/dashboard" : "/perfil-investidor.html";

    showMessage(data.message || "Login realizado com sucesso. Redirecionando...", "success");
    startLoginTransition(nextPage, hasInvestorProfile);
  }

  function openGooglePasswordStep(profile) {
    closeGooglePasswordStep();

    const modal = document.createElement("div");
    modal.className = "google-signup-modal";
    modal.innerHTML = `
      <div class="google-signup-card" role="dialog" aria-modal="true" aria-label="Concluir cadastro com Google">
        <button type="button" class="google-signup-close" aria-label="Fechar">×</button>
        <div class="google-signup-profile">
          ${profile.picture ? `<img src="${profile.picture}" alt="">` : ""}
          <div>
            <strong>${escapeHtml(profile.name || "Conta Google")}</strong>
            <span>${escapeHtml(profile.email || "")}</span>
          </div>
        </div>
        <h2>Crie sua senha</h2>
        <p>Seu e-mail Google já foi verificado. Agora crie uma senha para acessar a NexFinance também pelo login comum.</p>
        <form id="googleSignupForm">
          <label for="googleCompany">Nome da empresa</label>
          <input id="googleCompany" name="company" type="text" placeholder="Ex: Minha Empresa" required>
          <label for="googlePassword">Senha</label>
          <input id="googlePassword" name="password" type="password" placeholder="Crie uma senha" minlength="8" maxlength="8" required>
          <label for="googleConfirmPassword">Confirmar senha</label>
          <input id="googleConfirmPassword" name="confirmPassword" type="password" placeholder="Repita sua senha" minlength="8" maxlength="8" required>
          <button type="submit" class="btn-primary">Criar conta</button>
        </form>
      </div>
    `;

    modal.querySelector(".google-signup-close").addEventListener("click", closeGooglePasswordStep);
    modal.querySelector("#googleSignupForm").addEventListener("submit", completeGoogleSignup);
    document.body.append(modal);
  }

  function closeGooglePasswordStep() {
    document.querySelector(".google-signup-modal")?.remove();
  }

  function isDemoCredential(email, password) {
    return email.toLowerCase() === "teste@nexfinance.com" && password === "Senha123";
  }

  function startDemoSession(message) {
    const demoUser = {
      id: "demo",
      name: "Usuário Teste",
      username: "usuario.teste",
      email: "teste@nexfinance.com",
    };

    localStorage.removeItem("nexfinance_token");
    sessionStorage.setItem("nexfinance_demo_mode", "1");
    sessionStorage.setItem("nexfinance_user", JSON.stringify(demoUser));
    localStorage.setItem(getInvestorProfileKey(demoUser), JSON.stringify({ perfil: "Moderado" }));
    showMessage(message, "success");
    startLoginTransition("/dashboard", true);
  }

  function getInvestorProfileKey(user) {
    const identifier = user?.id || user?.email || "guest";
    return `nexfinance_investor_profile_${identifier}`;
  }

  function startLoginTransition(nextPage, hasInvestorProfile) {
    const overlay = document.createElement("div");
    overlay.className = "login-transition";
    overlay.innerHTML = `
      <div class="transition-card" role="status" aria-live="polite">
        <div class="transition-orbit" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <img src="img/LOGO-NEX.png.png" alt="NexFinance" class="transition-logo">
        <strong>${hasInvestorProfile ? "Abrindo seu dashboard" : "Preparando sua análise inicial"}</strong>
        <p>${hasInvestorProfile ? "Organizando seus indicadores." : "Antes do dashboard, vamos personalizar sua experiência."}</p>
        <div class="transition-progress" aria-hidden="true"><i></i></div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add("is-transitioning");

    requestAnimationFrame(() => {
      overlay.classList.add("is-active");
    });

    setTimeout(() => {
      overlay.classList.add("is-leaving");
    }, 1350);

    setTimeout(() => {
      window.location.href = nextPage;
    }, 1750);
  }

  function showMessage(message, type) {
    if (!messageBox) {
      alert(message);
      return;
    }

    messageBox.textContent = message;
    messageBox.style.display = "block";
    messageBox.style.padding = "12px";
    messageBox.style.borderRadius = "10px";
    messageBox.style.marginTop = "12px";
    messageBox.style.fontWeight = "600";

    if (type === "success") {
      messageBox.style.color = "#00856f";
      messageBox.style.background = "#e6fffa";
      messageBox.style.border = "1px solid #14b8a6";
    } else {
      messageBox.style.color = "#b91c1c";
      messageBox.style.background = "#fee2e2";
      messageBox.style.border = "1px solid #ef4444";
    }
  }

  function clearMessage() {
    if (!messageBox) return;
    messageBox.textContent = "";
    messageBox.style.display = "none";
  }

  function setLoading(button, isLoading, text) {
    if (!button) return;
    button.disabled = isLoading;
    if (text) {
      button.textContent = text;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
});
