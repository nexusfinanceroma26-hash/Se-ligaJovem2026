const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, "users.json");

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }

  const data = fs.readFileSync(USERS_FILE, "utf-8");
  return JSON.parse(data || "[]");
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getJwtSecret() {
  return process.env.JWT_SECRET || "nexfinance_dev_secret_change_me";
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "2h"
    }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Token não enviado."
    });
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2) {
    return res.status(401).json({
      message: "Token inválido."
    });
  }

  const [scheme, token] = parts;

  if (scheme !== "Bearer") {
    return res.status(401).json({
      message: "Formato de token inválido."
    });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Sessão expirada ou token inválido."
    });
  }
}

function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Registro de usuário
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      message: "Nome, e-mail e senha são obrigatórios."
    });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({
      message: "E-mail inválido."
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      message: "A senha precisa ter pelo menos 6 caracteres."
    });
  }

  const users = readUsers();
  const userExists = users.find((user) => user.email === email);

  if (userExists) {
    return res.status(409).json({
      message: "Este e-mail já está cadastrado."
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    role: "OWNER",
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  const token = generateToken(newUser);

  return res.status(201).json({
    message: "Conta criada com sucesso.",
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role
    }
  });
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "E-mail e senha são obrigatórios."
    });
  }

  const users = readUsers();
  const user = users.find((item) => item.email === email);

  if (!user) {
    return res.status(401).json({
      message: "E-mail ou senha inválidos."
    });
  }

  const passwordIsValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordIsValid) {
    return res.status(401).json({
      message: "E-mail ou senha inválidos."
    });
  }

  const token = generateToken(user);

  return res.json({
    message: "Login realizado com sucesso.",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

// Validar sessão JWT
app.get("/api/auth/me", authMiddleware, (req, res) => {
  return res.json({
    message: "Sessão válida.",
    user: req.user
  });
});

// Recuperação de senha simulada
app.post("/api/auth/forgot-password", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "Informe seu e-mail."
    });
  }

  const users = readUsers();
  const user = users.find((item) => item.email === email);

  if (!user) {
    return res.status(404).json({
      message: "E-mail não encontrado."
    });
  }

  const resetToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      type: "password_reset"
    },
    getJwtSecret(),
    {
      expiresIn: "15m"
    }
  );

  console.log("Link de recuperação:");
  console.log(`http://localhost:${PORT}/resetar.html?token=${resetToken}`);

  return res.json({
    message: "Link de recuperação gerado. Verifique o terminal do servidor.",
    resetToken
  });
});

// Resetar senha
app.post("/api/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      message: "Token e nova senha são obrigatórios."
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      message: "A nova senha precisa ter pelo menos 6 caracteres."
    });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (decoded.type !== "password_reset") {
      return res.status(401).json({
        message: "Token inválido para recuperação de senha."
      });
    }

    const users = readUsers();
    const userIndex = users.findIndex((user) => user.id === decoded.id);

    if (userIndex === -1) {
      return res.status(404).json({
        message: "Usuário não encontrado."
      });
    }

    users[userIndex].passwordHash = await bcrypt.hash(newPassword, 12);
    users[userIndex].updatedAt = new Date().toISOString();

    saveUsers(users);

    return res.json({
      message: "Senha alterada com sucesso."
    });
  } catch (error) {
    return res.status(401).json({
      message: "Token expirado ou inválido."
    });
  }
});

// Rota protegida de exemplo
app.get("/api/dashboard", authMiddleware, (req, res) => {
  return res.json({
    message: "Bem-vindo ao dashboard NexFinance.",
    user: req.user,
    data: {
      receita: 125430,
      despesas: 78250,
      lucro: 47180,
      scoreFinanceiro: 85
    }
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
