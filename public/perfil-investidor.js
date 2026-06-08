document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("nexfinance_token");
  const user = getUser();
  const form = document.querySelector("#investorProfileForm");
  const messageBox = document.querySelector("#profileMessage");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const profile = {
      goal: formData.get("goal"),
      risk: formData.get("risk"),
      experience: formData.get("experience"),
      horizon: formData.get("horizon"),
      monthlyInvestment: Number(formData.get("monthlyInvestment")) || 0,
      cashReserve: formData.get("cashReserve"),
      aiStyle: formData.get("aiStyle"),
      completedAt: new Date().toISOString(),
    };

    if (!isComplete(profile)) {
      showMessage("Preencha todos os campos para a IA montar seu perfil.", "error");
      return;
    }

    const result = calculateInvestorProfile(profile);
    const finalProfile = {
      ...profile,
      type: result.type,
      score: result.score,
      recommendation: result.recommendation,
      aiTone: result.aiTone,
    };

    const profileKey = getInvestorProfileKey(user);
    localStorage.setItem(profileKey, JSON.stringify(finalProfile));
    localStorage.setItem("nexfinance_investor_profile", JSON.stringify(finalProfile));

    localStorage.setItem(
      "nexfinance_user",
      JSON.stringify({
        ...user,
        investorProfileCompleted: true,
        investorProfileType: finalProfile.type,
      }),
    );

    showMessage(`Perfil ${finalProfile.type} salvo. Preparando sua IA...`, "success");

    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 900);
  });

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("nexfinance_user") || "{}");
    } catch {
      return {};
    }
  }

  function getInvestorProfileKey(currentUser) {
    const identifier = currentUser?.id || currentUser?.email || "guest";
    return `nexfinance_investor_profile_${identifier}`;
  }

  function isComplete(profile) {
    return Boolean(
      profile.goal &&
      profile.risk &&
      profile.experience &&
      profile.horizon &&
      profile.monthlyInvestment >= 0 &&
      profile.cashReserve &&
      profile.aiStyle,
    );
  }

  function calculateInvestorProfile(profile) {
    let score = 0;

    if (profile.risk === "conservador") score += 1;
    if (profile.risk === "moderado") score += 2;
    if (profile.risk === "arrojado") score += 3;

    if (profile.horizon === "curto") score += 1;
    if (profile.horizon === "medio") score += 2;
    if (profile.horizon === "longo") score += 3;

    if (profile.cashReserve === "baixa") score += 1;
    if (profile.cashReserve === "media") score += 2;
    if (profile.cashReserve === "alta") score += 3;

    if (profile.goal === "proteger-caixa" || profile.goal === "organizar") score += 1;
    if (profile.goal === "crescer") score += 2;
    if (profile.goal === "expandir") score += 3;

    if (score <= 6) {
      return {
        score,
        type: "Conservador",
        aiTone: "cuidadosa",
        recommendation: "Priorizar caixa, previsibilidade, redução de riscos e decisões com margem de segurança.",
      };
    }

    if (score <= 9) {
      return {
        score,
        type: "Moderado",
        aiTone: "equilibrada",
        recommendation: "Equilibrar crescimento com controle de caixa, margem e exposição financeira.",
      };
    }

    return {
      score,
      type: "Arrojado",
      aiTone: "expansiva",
      recommendation: "Buscar expansão, novas oportunidades e maior retorno, mantendo alertas de risco bem visíveis.",
    };
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
});
