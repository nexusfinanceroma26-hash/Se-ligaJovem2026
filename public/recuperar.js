const API_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("recoverForm");
  const message = document.getElementById("recoverMessage");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    setMessage(message, "");

    if (!email) {
      setMessage(message, "Digite seu e-mail.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(message, data.message || "Erro ao recuperar senha.", "error");
        return;
      }

      setMessage(message, data.message, "success");
      console.log("Token de recuperação:", data.resetToken);
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
