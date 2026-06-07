const API_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const company = document.getElementById("company").value.trim();
    const cnpj = document.getElementById("cnpj").value.trim();

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          email,
          password,
          company,
          cnpj
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errors) {
          const errorMsgs = Object.values(data.errors).join("\n");
          alert(`Erro na validação:\n${errorMsgs}`);
          return;
        }
        alert(data.message || "Erro ao criar conta.");
        return;
      }

      alert("Conta criada com sucesso!");

      localStorage.setItem("nexfinance_token", data.token);
      localStorage.setItem("nexfinance_user", JSON.stringify(data.user));

      window.location.href = "dashboard.html";
    } catch (error) {
      alert("Erro ao conectar com o servidor.");
      console.error(error);
    }
  });
});