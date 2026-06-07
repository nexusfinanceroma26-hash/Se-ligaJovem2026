// Validação de entrada com expressões regulares

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  // Mínimo 6 caracteres
  return password && password.length >= 6;
};

const validateName = (name) => {
  // Mínimo 3 caracteres, máximo 100
  return name && name.length >= 3 && name.length <= 100;
};

const validateCompanyName = (companyName) => {
  return companyName && companyName.length >= 3 && companyName.length <= 150;
};

// Sanitizar entrada para evitar XSS
const sanitizeInput = (input) => {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove tags HTML básicas
    .substring(0, 500); // Limita tamanho
};

const validateRegisterInput = (data) => {
  const errors = [];

  if (!data.name || !validateName(data.name)) {
    errors.push("Nome deve ter entre 3 e 100 caracteres");
  }

  if (!data.email || !validateEmail(data.email)) {
    errors.push("Email inválido");
  }

  if (!data.password || !validatePassword(data.password)) {
    errors.push("Senha deve ter no mínimo 6 caracteres");
  }

  if (!data.company || !validateCompanyName(data.company)) {
    errors.push("Nome da empresa deve ter entre 3 e 150 caracteres");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validateLoginInput = (data) => {
  const errors = [];

  if (!data.email || !validateEmail(data.email)) {
    errors.push("Email inválido");
  }

  if (!data.password || !validatePassword(data.password)) {
    errors.push("Senha inválida");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateEmail,
  validatePassword,
  validateName,
  validateCompanyName,
  sanitizeInput,
  validateRegisterInput,
  validateLoginInput,
};
