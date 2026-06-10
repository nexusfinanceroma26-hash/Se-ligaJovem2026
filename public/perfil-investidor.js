document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("nexfinance_token");
  const user = getUser();
  const form = document.querySelector("#investorProfileForm");
  const messageBox = document.querySelector("#profileMessage");

  if (!token) {
    localStorage.setItem("nexfinance_token", "demo-presentation-token");
    localStorage.setItem("nexfinance_user", JSON.stringify({ id: "demo", name: "Usuário Teste", email: "demo@nexfinance.com" }));
  }

  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const profile = {
      businessType: formData.get("businessType"),
      segment: formData.get("segment"),
      goal: formData.get("goal"),
      risk: formData.get("risk"),
      experience: formData.get("experience"),
      businessStage: formData.get("businessStage"),
      monthlyRevenue: Number(formData.get("monthlyRevenue")) || 0,
      cashReserve: formData.get("cashReserve"),
      teamSize: formData.get("teamSize"),
      mainChallenge: formData.get("mainChallenge"),
      aiStyle: formData.get("aiStyle"),
      completedAt: new Date().toISOString(),
    };

    if (!isComplete(profile)) {
      showMessage("Preencha todos os campos para a IA montar o perfil do negócio.", "error");
      return;
    }

    const result = calculateBusinessProfile(profile);
    const finalProfile = {
      ...profile,
      type: result.type,
      score: result.score,
      recommendation: result.recommendation,
      aiTone: result.aiTone,
      priorityFocus: result.priorityFocus,
    };

    const profileKey = getBusinessProfileKey(user);
    localStorage.setItem(profileKey, JSON.stringify(finalProfile));
    localStorage.setItem("nexfinance_business_profile", JSON.stringify(finalProfile));

    // Compatibilidade com o fluxo antigo do login.
    localStorage.setItem("nexfinance_investor_profile", JSON.stringify(finalProfile));

    localStorage.setItem(
      "nexfinance_user",
      JSON.stringify({
        ...user,
        businessProfileCompleted: true,
        investorProfileCompleted: true,
        businessProfileType: finalProfile.type,
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

  function getBusinessProfileKey(currentUser) {
    const identifier = currentUser?.id || currentUser?.email || "guest";
    return `nexfinance_investor_profile_${identifier}`;
  }

  function isComplete(profile) {
    return Boolean(
      profile.businessType &&
      profile.segment &&
      profile.goal &&
      profile.risk &&
      profile.experience &&
      profile.businessStage &&
      profile.monthlyRevenue >= 0 &&
      profile.cashReserve &&
      profile.teamSize &&
      profile.mainChallenge &&
      profile.aiStyle,
    );
  }

  function calculateBusinessProfile(profile) {
    let score = 0;

    if (profile.risk === "conservador") score += 1;
    if (profile.risk === "moderado") score += 2;
    if (profile.risk === "arrojado") score += 3;

    if (profile.cashReserve === "baixa") score += 1;
    if (profile.cashReserve === "media") score += 2;
    if (profile.cashReserve === "alta") score += 3;

    if (profile.businessStage === "comecando" || profile.businessStage === "validando") score += 1;
    if (profile.businessStage === "estavel" || profile.businessStage === "reestruturando") score += 2;
    if (profile.businessStage === "crescimento") score += 3;

    if (profile.goal === "organizar" || profile.goal === "proteger-caixa") score += 1;
    if (profile.goal === "vender-mais" || profile.goal === "controlar-estoque" || profile.goal === "reduzir-custos") score += 2;
    if (profile.goal === "crescer" || profile.goal === "captar-investimento") score += 3;

    const priorityFocus = getPriorityFocus(profile);

    if (score <= 6) {
      return {
        score,
        type: "Operação em organização",
        aiTone: "cuidadosa",
        priorityFocus,
        recommendation: "Priorizar organização financeira, controle de caixa e rotina simples de acompanhamento semanal.",
      };
    }

    if (score <= 9) {
      return {
        score,
        type: "Negócio em controle",
        aiTone: "equilibrada",
        priorityFocus,
        recommendation: "Equilibrar crescimento com margem, estoque, fornecedores e previsibilidade de caixa.",
      };
    }

    return {
      score,
      type: "Negócio em crescimento",
      aiTone: "expansiva",
      priorityFocus,
      recommendation: "Buscar crescimento com metas, análise de canais, controle de risco e decisões orientadas por dados.",
    };
  }

  function getPriorityFocus(profile) {
    const map = {
      caixa: "Fluxo de caixa",
      estoque: "Estoque e compras",
      vendas: "Vendas e canais",
      custos: "Custos e fornecedores",
      clientes: "Clientes e recorrência",
      organizacao: "Organização geral",
    };

    return map[profile.mainChallenge] || "Gestão do negócio";
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

