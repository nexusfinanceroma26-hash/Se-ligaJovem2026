document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("cadastroForm");
  const messageBox = document.getElementById("registerMessage");
  const submitButton = form?.querySelector("button[type='submit']");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();

    if (!name || !email || !password || !confirmPassword) {
      showMessage("Preencha todos os campos.", "error");
      return;
    }

    if (password.length < 6) {
      showMessage("A senha precisa ter pelo menos 6 caracteres.", "error");
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showMessage(data.message || "Não foi possível criar sua conta.", "error");
        return;
      }

      showMessage("Conta criada com sucesso. Redirecionando para o login...", "success");

      setTimeout(() => {
        window.location.href = "login.html";
      }, 900);
    } catch (error) {
      console.error("Erro ao criar conta:", error);
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
    submitButton.textContent = isLoading ? "Criando conta..." : "Criar conta";
  }
});
