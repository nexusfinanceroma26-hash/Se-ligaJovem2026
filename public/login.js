document.addEventListener("DOMContentLoaded", () => {
  console.log("login.js carregado com sucesso");

  const loginForm = document.querySelector("#loginForm");
  const emailInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const messageBox = document.querySelector("#loginMessage");
  const submitButton = loginForm?.querySelector("button[type='submit']");

  if (!loginForm) {
    console.error("Formulário #loginForm não encontrado.");
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    console.log("Formulário interceptado pelo login.js");

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    clearMessage();

    if (!email || !password) {
      showMessage("Preencha o e-mail e a senha.", "error");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const contentType = response.headers.get("content-type");

      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Resposta não JSON:", text);
        showMessage("Erro: o servidor não retornou JSON.", "error");
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        showMessage(data.message || "E-mail ou senha incorretos.", "error");
        return;
      }

      localStorage.setItem("nexfinance_token", data.token);
      localStorage.setItem("nexfinance_user", JSON.stringify(data.user));

      showMessage("Login realizado com sucesso. Redirecionando...", "success");

      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 700);

    } catch (error) {
      console.error("Erro ao fazer login:", error);
      showMessage("Não foi possível conectar ao servidor.", "error");
    } finally {
      setLoading(false);
    }
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

  function clearMessage() {
    if (!messageBox) return;
    messageBox.textContent = "";
    messageBox.style.display = "none";
  }

  function setLoading(isLoading) {
    if (!submitButton) return;
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Entrando..." : "Entrar";
  }
});