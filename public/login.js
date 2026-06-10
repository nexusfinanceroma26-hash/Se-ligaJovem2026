document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#loginForm");
  const emailInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const messageBox = document.querySelector("#loginMessage");
  const submitButton = loginForm?.querySelector("button[type='submit']");
  const googleButton = document.querySelector(".btn-google");

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
    showMessage("Entrando com acesso rápido de demonstração...", "success");

    loginWithCredentials("teste@nexfinance.com", "123456", {
      button: googleButton,
      loadingText: "Conectando...",
      defaultText: "Continuar com Google",
      allowDemoFallback: true,
    });
  });

  async function loginWithCredentials(email, password, options = {}) {
    const { button, loadingText, defaultText, allowDemoFallback = false } = options;
    setLoading(button, true, loadingText);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
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

      localStorage.setItem("nexfinance_token", data.token);
      localStorage.setItem("nexfinance_user", JSON.stringify(data.user));

      const profileKey = getInvestorProfileKey(data.user);
      const hasInvestorProfile = Boolean(localStorage.getItem(profileKey));
      const nextPage = hasInvestorProfile ? "/dashboard" : "/perfil-investidor.html";

      showMessage("Login realizado com sucesso. Redirecionando...", "success");
      startLoginTransition(nextPage, hasInvestorProfile);
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

  function isDemoCredential(email, password) {
    return email.toLowerCase() === "teste@nexfinance.com" && password === "123456";
  }

  function startDemoSession(message) {
    const demoUser = {
      id: "demo",
      name: "Usuário Teste",
      username: "usuario.teste",
      email: "teste@nexfinance.com",
    };

    localStorage.setItem("nexfinance_token", "demo-presentation-token");
    localStorage.setItem("nexfinance_user", JSON.stringify(demoUser));
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
});
