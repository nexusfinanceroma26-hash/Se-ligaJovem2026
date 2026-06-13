const API_URL = "/api";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      credentials: "same-origin",
    });

    if (!response.ok) {
      clearSession();
      return;
    }

    const data = await response.json();
    sessionStorage.setItem("nexfinance_user", JSON.stringify(data.user));
  } catch (error) {
    clearSession();
  }
});

async function clearSession() {
  localStorage.removeItem("nexfinance_token");
  sessionStorage.removeItem("nexfinance_user");

  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Logout local continua mesmo que o servidor esteja indisponível.
  }

  window.location.href = "login.html";
}
