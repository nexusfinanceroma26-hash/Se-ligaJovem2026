document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("recoverForm");
  const emailInput = document.getElementById("email");
  const messageBox = document.getElementById("recoverMessage");
  const submitButton = form?.querySelector("button[type='submit']");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();

    if (!email) {
      showMessage("Informe seu e-mail.", "error");
      return;
    }

    setLoading(true);

    try {
      await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch (error) {
      console.info("Recuperação em modo apresentação:", error);
    } finally {
      setLoading(false);
      showMessage("Se o e-mail estiver cadastrado, as instruções serão enviadas. Para apresentação, o fluxo foi simulado com sucesso.", "success");
    }
  });

  function showMessage(message, type) {
    if (!messageBox) return;
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

  function setLoading(isLoading) {
    if (!submitButton) return;
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Enviando..." : "Enviar instruções";
  }
});

