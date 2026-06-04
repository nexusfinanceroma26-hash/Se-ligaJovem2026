const API_URL = "http://localhost:3000/api";

document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("nexfinance_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      localStorage.removeItem("nexfinance_token");
      localStorage.removeItem("nexfinance_user");
      window.location.href = "login.html";
      return;
    }

    const data = await response.json();
    console.log("Sessão válida:", data.user);
  } catch (error) {
    localStorage.removeItem("nexfinance_token");
    localStorage.removeItem("nexfinance_user");
    window.location.href = "login.html";
  }
});