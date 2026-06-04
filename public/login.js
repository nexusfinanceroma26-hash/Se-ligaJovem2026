const API_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("loginMessage");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    setMessage(message, "");

    if (!email || !password) {
      setMessage(message, "Preencha e-mail e senha.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(message, data.message || "Erro ao fazer login.", "error");
        return;
      }

      localStorage.setItem("nexfinance_token", data.token);
      localStorage.setItem("nexfinance_user", JSON.stringify(data.user));

      setMessage(message, "Login realizado com sucesso.", "success");
      window.location.href = "dashboard.html";
    } catch (error) {
      setMessage(message, "Erro ao conectar com o servidor.", "error");
      console.error(error);
    }
  });
});

function setMessage(element, text, type) {
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type || ""}`;
}
