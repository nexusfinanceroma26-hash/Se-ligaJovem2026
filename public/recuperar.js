const API_URL = "http://localhost:3000/api";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();

    if (!email) {
      alert("Digite seu e-mail.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Erro ao recuperar senha.");
        return;
      }

      alert(data.message);
      console.log("Token de recuperação:", data.resetToken);
    } catch (error) {
      alert("Erro ao conectar com o servidor.");
      console.error(error);
    }
  });
});