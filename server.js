const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();

const PORT = 3000;
const JWT_SECRET = "nexfinance_secret_key_dev";

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, "public")));

// Banco fake em memória para teste
const users = [];

// Usuário padrão para teste
const defaultPasswordHash = bcrypt.hashSync("123456", 10);

users.push({
  id: 1,
  name: "Usuário Teste",
  email: "teste@nexfinance.com",
  passwordHash: defaultPasswordHash,
});

// Rota inicial
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Rota de cadastro
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nome, email e senha são obrigatórios.",
      });
    }

    const userExists = users.find((user) => user.email === email);

    if (userExists) {
      return res.status(409).json({
        success: false,
        message: "Este email já está cadastrado.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = {
      id: users.length + 1,
      name,
      email,
      passwordHash,
    };

    users.push(newUser);

    return res.status(201).json({
      success: true,
      message: "Usuário criado com sucesso.",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error("Erro no cadastro:", error);

    return res.status(500).json({
      success: false,
      message: "Erro interno ao cadastrar usuário.",
    });
  }
});

// Rota de login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("Tentativa de login:", email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email e senha são obrigatórios.",
      });
    }

    const user = users.find((user) => user.email === email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email ou senha incorretos.",
      });
    }

    const passwordIsValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordIsValid) {
      return res.status(401).json({
        success: false,
        message: "Email ou senha incorretos.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login realizado com sucesso.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);

    return res.status(500).json({
      success: false,
      message: "Erro interno no servidor ao fazer login.",
    });
  }
});

// Rota protegida para testar dashboard
app.get("/api/dashboard", (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Token não enviado.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token inválido.",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    return res.status(200).json({
      success: true,
      message: "Acesso autorizado ao dashboard.",
      user: decoded,
      dashboard: {
        receitaTotal: 12500,
        despesasTotais: 6700,
        lucroLiquido: 5800,
        scoreFinanceiro: 87,
      },
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token expirado ou inválido.",
    });
  }
});

// Abrir dashboard HTML
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Abrir login HTML
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Rota fallback para evitar HTML em API
app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "Rota de API não encontrada.",
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor NexFinance rodando em http://localhost:${PORT}`);
  console.log("Usuário teste:");
  console.log("Email: teste@nexfinance.com");
  console.log("Senha: 123456");
});