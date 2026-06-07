require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");
const supabase = require("./supabaseClient");
const { verifyToken } = require("./middleware");
const {
  validateRegisterInput,
  validateLoginInput,
  sanitizeInput,
} = require("./validation");

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10");

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Desativado para facilitar o deploy inicial com scripts externos
}));
app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.CLIENT_URL : '*',
  optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting para rotas de autenticação (Proteção contra Brute Force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições por IP
  message: {
    success: false,
    message: "Muitas tentativas de acesso. Tente novamente em 15 minutos."
  }
});

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, "public")));

// ===== ROTAS =====

// Rota de Teste de Conexão com Banco
app.get("/api/test-db", async (req, res) => {
  try {
    const { data, error } = await supabase.from("users").select("id").limit(1);
    if (error) throw error;
    return res.status(200).json({
      success: true,
      message: "Conexão com Supabase está funcionando!",
      database_status: "Online"
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Erro ao conectar com o banco de dados: " + err.message
    });
  }
});

// Rota inicial
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Rota de cadastro com Supabase
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    console.log("📝 Tentativa de cadastro para:", req.body.email);

    let { name, email, password, company, cnpj } = req.body;

    // Validar entrada
    const validation = validateRegisterInput({ name, email, password, company });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Erro na validação",
        errors: validation.errors,
      });
    }

    // Sanitizar entrada
    name = sanitizeInput(name);
    email = sanitizeInput(email).toLowerCase();
    company = sanitizeInput(company);
    cnpj = sanitizeInput(cnpj);

    // Verificar se email já existe no Supabase
    const { data: existingUser, error: checkError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Este email já está cadastrado.",
      });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Inserir usuário no Supabase
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert([
        {
          name,
          email,
          password_hash: passwordHash,
          company_name: company,
          created_at: new Date().toISOString(),
        },
      ])
      .select("id, name, email, company_name");

    if (insertError) {
      console.error("❌ ERRO NO INSERT:", insertError);
      return res.status(500).json({
        success: false,
        message: "Erro ao cadastrar usuário.",
      });
    }

    if (!newUser || newUser.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Erro ao recuperar dados do usuário recém-criado.",
      });
    }

    const userData = newUser[0];

    // Criar a empresa automaticamente vinculada ao usuário
    const { error: companyError } = await supabase
      .from("companies")
      .insert([
        {
          owner_id: userData.id,
          name: company,
          cnpj: cnpj || null,
          status: 'active'
        }
      ]);

    if (companyError) {
      console.error("⚠️ Erro ao criar empresa vinculada:", companyError);
      // Não travamos o cadastro, mas logamos o erro
    }
    
    // Gerar JWT para o usuário recém-criado (para login automático)
    const token = jwt.sign(
      {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        company: userData.company_name,
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Usuário criado com sucesso.",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("Erro no cadastro:", error);
    return res.status(500).json({
      success: false,
      message: "Erro interno ao cadastrar usuário.",
    });
  }
});

// Rota de login com Supabase
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;

    // Validar entrada
    const validation = validateLoginInput({ email, password });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Erro na validação",
        errors: validation.errors,
      });
    }

    // Sanitizar entrada
    email = sanitizeInput(email).toLowerCase();

    // Buscar usuário no Supabase
    const { data: users, error: queryError } = await supabase
      .from("users")
      .select("id, name, email, company_name, password_hash")
      .eq("email", email)
      .limit(1);

    if (queryError) {
      console.error("❌ ERRO NA BUSCA (LOGIN):", {
        message: queryError.message,
        code: queryError.code,
        details: queryError.details
      });
      return res.status(500).json({ success: false, message: "Erro na conexão com o banco." });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Email ou senha incorretos.",
      });
    }

    const user = users[0];

    // Verificar senha
    const passwordIsValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordIsValid) {
      return res.status(401).json({
        success: false,
        message: "Email ou senha incorretos.",
      });
    }

    // Gerar JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company_name,
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
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
        company: user.company_name,
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

// Rota protegida para dashboard
app.get("/api/dashboard", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Buscar dados do usuário no Supabase
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name, email, company_name")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado.",
      });
    }

    // Dados fictícios do dashboard (será substituído por dados reais)
    const dashboardData = {
      receitaTotal: 486240,
      despesasTotais: 279880,
      lucroLiquido: 206360,
      scoreFinanceiro: 86,
    };

    return res.status(200).json({
      success: true,
      message: "Acesso autorizado ao dashboard.",
      user,
      dashboard: dashboardData,
    });
  } catch (error) {
    console.error("Erro ao buscar dashboard:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao carregar dashboard.",
    });
  }
});

// Rota para verificar sessão atual (usada pelo session.js)
app.get("/api/auth/me", verifyToken, (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user
  });
});

// Abrir dashboard HTML
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Abrir cadastro HTML
app.get("/cadastro", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cadastro.html"));
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
  if (!JWT_SECRET) {
    console.error("❌ ERRO CRÍTICO: SUPABASE_JWT_SECRET não definida!");
    console.error("O servidor não pode iniciar com segurança sem esta chave.");
    process.exit(1);
  }

  console.log("\n========================================");
  console.log("✅ Servidor NexFinance rodando!");
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔐 Ambiente: ${process.env.NODE_ENV || "development"}`);
  console.log("========================================\n");

  if (process.env.NODE_ENV !== "production") {
    console.log("⚠️ Configuração de Supabase:");
    console.log(`✓ SUPABASE_URL: ${process.env.SUPABASE_URL ? "✓ Configurado" : "❌ Não configurado"}`);
    console.log(`✓ SUPABASE_KEY: ${process.env.SUPABASE_KEY ? "✓ Configurado" : "❌ Não configurado"}`);
    console.log("=====================================\n");
  }
});