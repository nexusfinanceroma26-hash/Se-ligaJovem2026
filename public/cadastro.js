document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("cadastroForm");
  const messageBox = document.getElementById("registerMessage");
  const submitButton = form?.querySelector("button[type='submit']");
  let lastRegistrationEmail = "";

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const name = document.getElementById("name").value.trim();
    const username = document.getElementById("username")?.value.trim() || "";
    const company = document.getElementById("company").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();
    lastRegistrationEmail = email;

    if (!name || !company || !email || !password || !confirmPassword) {
      showMessage("Preencha todos os campos.", "error");
      return;
    }

    if (company.length < 3) {
      showMessage("Informe o nome da empresa com pelo menos 3 caracteres.", "error");
      return;
    }

    if (username && !/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
      showMessage("Use um nome de usuário com 3 a 24 caracteres, apenas letras, números, ponto, traço ou underline.", "error");
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

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          username,
          company,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showMessage(data.message || "Não foi possível criar sua conta.", "error");
        return;
      }

      localStorage.removeItem("nexfinance_token");
      sessionStorage.removeItem("nexfinance_user");
      showMessage(data.message || "Enviamos um link de validação para o email cadastrado.", "success");
      showResendVerification(email);

      if (data.devVerificationUrl) {
        showDevVerificationLink(data.devVerificationUrl);
      }
    } catch (error) {
      console.error("Erro ao criar conta:", error);
      showMessage("Não foi possível enviar a validação agora. Tente novamente em instantes.", "error");
    } finally {
      setLoading(false);
    }
  });

  messageBox?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-resend-verification]");
    if (!button) return;

    event.preventDefault();
    await resendVerification(button.dataset.resendVerification || lastRegistrationEmail);
  });

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

  function showDevVerificationLink(url) {
    if (!messageBox) return;

    const helper = document.createElement("div");
    helper.style.marginTop = "10px";
    helper.style.fontSize = "13px";
    helper.style.lineHeight = "1.5";
    helper.innerHTML = `Modo local: <a href="${url}" style="color:#005b4f;font-weight:800;text-decoration:underline;">clique aqui para validar este email</a>.`;
    messageBox.appendChild(helper);
  }

  function showResendVerification(email) {
    if (!messageBox || !email) return;

    const helper = document.createElement("div");
    helper.className = "email-verification-helper";
    helper.innerHTML = `
      <span>Não recebeu? Confira o spam ou reenvie o link.</span>
      <button type="button" data-resend-verification="${escapeHtml(email)}">Reenviar email</button>
    `;
    messageBox.appendChild(helper);
  }

  async function resendVerification(email) {
    if (!email) {
      showMessage("Informe seu email para reenviar a confirmação.", "error");
      return;
    }

    const button = messageBox?.querySelector("[data-resend-verification]");
    if (button) {
      button.disabled = true;
      button.textContent = "Reenviando...";
    }

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      showMessage(data.message || "Confira seu email para validar a conta.", response.ok && data.success ? "success" : "error");

      if (response.ok && data.success) {
        showResendVerification(email);
      }

      if (data.devVerificationUrl) {
        showDevVerificationLink(data.devVerificationUrl);
      }
    } catch (error) {
      console.error("Erro ao reenviar validação:", error);
      showMessage("Não foi possível reenviar o email agora.", "error");
      showResendVerification(email);
    }
  }

  function clearMessage() {
    if (!messageBox) return;
    messageBox.textContent = "";
    messageBox.style.display = "none";
  }

  function setLoading(isLoading) {
    if (!submitButton) return;
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Criando conta..." : "Criar conta";
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

