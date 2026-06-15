require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const supabase = require("./supabaseClient");
const {
  validateRegisterInput,
  validateLoginInput,
  validateEmail,
  validatePassword,
  sanitizeInput,
} = require("./validation");

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = resolveJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const AUTH_COOKIE_NAME = "nexfinance_auth";
const AUTH_COOKIE_MAX_AGE_MS = 60 * 60 * 1000;
const BCRYPT_ROUNDS = Math.max(parseInt(process.env.BCRYPT_ROUNDS || "12", 10), 12);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const demoUsers = [
  {
    id: "demo",
    name: "Usuário Teste",
    email: "teste@nexfinance.com",
    company_name: "NexFoods Comércio LTDA",
    password_hash: bcrypt.hashSync("Senha123", BCRYPT_ROUNDS),
    email_verified: true,
  },
];
const pendingRegistrationsByToken = new Map();
const pendingRegistrationsByEmail = new Map();
const pendingPasswordResetsByToken = new Map();
const pendingPasswordResetsByEmail = new Map();
const EMAIL_VERIFICATION_EXPIRES_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_EXPIRES_MS = 1000 * 60 * 60;

app.disable("x-powered-by");

const TRUSTED_ORIGINS = buildTrustedOrigins();

// Helmet adiciona headers de segurança como X-Frame-Options, X-Content-Type-Options e HSTS.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: buildCspDirectives(),
  },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "same-site" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin || TRUSTED_ORIGINS.has(origin) || isLocalhostOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origem não permitida pelo CORS."));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));
app.use(express.json({ limit: "120kb" }));
app.use(express.urlencoded({ extended: true, limit: "120kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Muitas tentativas de acesso. Tente novamente em 15 minutos.",
  },
});

// Limiter estrito para login: reduz força bruta por IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many attempts. Try again in 15 minutes.",
    message: "Muitas tentativas. Tente novamente em 15 minutos.",
  },
});

// Limiter geral para cadastro, recuperação e verificação de email.
const sensitiveRouteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Try again later.",
    message: "Muitas solicitações. Tente novamente mais tarde.",
  },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Muitas solicitações para a IA. Aguarde um minuto e tente novamente.",
  },
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", sensitiveRouteLimiter);
app.use("/api/auth/cadastro", sensitiveRouteLimiter);
app.use("/api/auth/recover", sensitiveRouteLimiter);
app.use("/api/auth/recuperar", sensitiveRouteLimiter);
app.use("/api/auth/forgot-password", sensitiveRouteLimiter);
app.use("/api/auth/reset-password", sensitiveRouteLimiter);
app.use("/api/auth/verify-email", sensitiveRouteLimiter);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/cadastro", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cadastro.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/api/test-db", async (req, res) => {
  if (!supabase) {
    return res.status(200).json({
      success: true,
      message: "Modo demonstração ativo. Supabase ainda não configurado.",
      database_status: "Demo",
    });
  }

  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    if (error) throw error;
    return res.status(200).json({
      success: true,
      message: "Conexão com Supabase funcionando.",
      database_status: "Online",
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      message: `Supabase indisponível. Modo demonstração ativo: ${error.message}`,
      database_status: "Demo",
    });
  }
});

app.post("/api/auth/register-old", (req, res) => {
  return res.status(410).json({
    success: false,
    message: "Essa rota de cadastro foi desativada por segurança. Use /api/auth/register.",
  });
});

app.post("/api/auth/register-legacy-disabled", (req, res) => {
  return res.status(410).json({
    success: false,
    message: "Essa rota legada foi desativada por segurança.",
  });
});

app.post("/__disabled__/api/auth/register-legacy-disabled", authLimiter, async (req, res) => {
  try {
    let { name, username, email, password, company, cnpj } = req.body;

    const validation = validateRegisterInput({ name, email, password, company });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Erro na validação.",
        errors: validation.errors,
      });
    }

    name = sanitizeInput(name);
    username = normalizeUsername(username, email);
    email = sanitizeInput(email).toLowerCase();
    company = sanitizeInput(company);
    cnpj = sanitizeInput(cnpj);

    if (!supabase) {
      const existingUser = demoUsers.find((user) => user.email === email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Este email já está cadastrado.",
        });
      }

      const newUser = {
        id: `demo-${Date.now()}`,
        name,
        email,
        company_name: company,
        password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      };

      demoUsers.push(newUser);
      return sendAuthResponse(res, 201, newUser, "Usuário criado em modo demonstração.");
    }

    const { data: existingUser } = await supabase
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

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert([{
        name,
        email,
        password_hash: passwordHash,
        company_name: company,
        created_at: new Date().toISOString(),
      }])
      .select("id, name, email, company_name");

    if (insertError || !newUser?.length) {
      return res.status(500).json({
        success: false,
        message: "Erro ao cadastrar usuário.",
      });
    }

    const userData = newUser[0];

    await supabase
      .from("companies")
      .insert([{ owner_id: userData.id, name: company, cnpj: cnpj || null, status: "active" }]);

    return sendAuthResponse(res, 201, userData, "Usuário criado com sucesso.");
  } catch (error) {
    console.error("Erro no cadastro:", error);
    const fallbackUser = {
      id: `demo-${Date.now()}`,
      name: sanitizeInput(req.body.name || "Usuário Demo"),
      email: sanitizeInput(req.body.email || `demo-${Date.now()}@nexfinance.com`).toLowerCase(),
      company_name: sanitizeInput(req.body.company || "Empresa Demo"),
      password_hash: bcrypt.hashSync(req.body.password || "Senha123", BCRYPT_ROUNDS),
    };

    demoUsers.push(fallbackUser);
    return sendAuthResponse(res, 201, fallbackUser, "Supabase indisponível. Usuário criado em modo demonstração.");
  }
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    let { name, username, email, password, company, cnpj } = req.body;

    const validation = validateRegisterInput({ name, email, password, company });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Erro na validação.",
        errors: validation.errors,
      });
    }

    name = sanitizeInput(name);
    username = normalizeUsername(username, email);
    email = sanitizeInput(email).toLowerCase();
    company = sanitizeInput(company);
    cnpj = sanitizeInput(cnpj);

    const existingDemoUser = demoUsers.find((user) => user.email === email);
    if (existingDemoUser) {
      return res.status(409).json({
        success: false,
        message: "Este email já está cadastrado.",
      });
    }

    if (pendingRegistrationsByEmail.has(email)) {
      removePendingRegistration(email);
    }

    if (supabase) {
      const { data: existingUser } = await supabase
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
    }

    const verification = createEmailVerificationToken();
    const verificationUrl = `${getAppBaseUrl(req)}/api/auth/verify-email?token=${verification.token}`;
    const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRES_MS).toISOString();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    if (!supabase) {
      // Segurança: em modo local a conta também nasce não verificada até o link ser usado.
      demoUsers.push({
        id: `demo-${Date.now()}`,
        name: username || name,
        full_name: name,
        username,
        email,
        company_name: company,
        password_hash: passwordHash,
        emailVerified: false,
        email_verified: false,
        emailVerificationToken: verification.tokenHash,
        email_verification_token_hash: verification.tokenHash,
        emailVerificationExpires: verificationExpiresAt,
        email_verification_expires_at: verificationExpiresAt,
        cnpj: cnpj || null,
      });
    } else {
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert([{
          name: username || name,
          email,
          password_hash: passwordHash,
          company_name: company,
          email_verified: false,
          email_verification_token_hash: verification.tokenHash,
          email_verification_expires_at: verificationExpiresAt,
          created_at: new Date().toISOString(),
        }])
        .select("id, name, email, company_name")
        .single();

      if (insertError || !newUser) {
        return res.status(500).json({
          success: false,
          message: "Erro ao criar usuário para validação por email.",
        });
      }

      await supabase
        .from("companies")
        .insert([{
          owner_id: newUser.id,
          name: company,
          cnpj: cnpj || null,
          status: "pending_email_verification",
        }]);
    }

    pendingRegistrationsByEmail.set(email, verification.tokenHash);

    await sendVerificationEmail({ to: email, name, verificationUrl });

    return res.status(201).json({
      success: true,
      requiresEmailVerification: true,
      message: "Enviamos um link de validação para o email cadastrado. Confirme o email antes de fazer login.",
      devVerificationUrl: shouldExposeDevVerificationUrl() ? verificationUrl : undefined,
    });
  } catch (error) {
    console.error("Erro no cadastro:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao criar validação por email. Tente novamente em instantes.",
    });
  }
});

app.get("/api/auth/verify-email", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    const tokenHash = hashToken(token);

    if (!token) {
      return res.status(400).send(renderVerificationPage({
        title: "Link inválido",
        message: "Esse link de validação não é válido. Solicite um novo cadastro.",
        linkLabel: "Voltar ao cadastro",
        linkHref: "/cadastro.html",
      }));
    }

    if (!supabase) {
      const demoUser = demoUsers.find((user) => user.emailVerificationToken === tokenHash || user.email_verification_token_hash === tokenHash);
      if (!demoUser || new Date(demoUser.emailVerificationExpires || demoUser.email_verification_expires_at).getTime() < Date.now()) {
        return res.status(400).send(renderVerificationPage({
          title: "Link expirado",
          message: "Esse link de validação expirou ou já foi usado. Crie a conta novamente para receber um novo link.",
          linkLabel: "Voltar ao cadastro",
          linkHref: "/cadastro.html",
        }));
      }

      demoUser.emailVerified = true;
      demoUser.email_verified = true;
      demoUser.email_verified_at = new Date().toISOString();
      delete demoUser.emailVerificationToken;
      delete demoUser.email_verification_token_hash;
      delete demoUser.emailVerificationExpires;
      delete demoUser.email_verification_expires_at;
      removePendingRegistration(demoUser.email);

      return res.status(200).send(renderVerificationPage({
        title: "Email confirmado",
        message: "Sua conta foi validada com sucesso. Agora você já pode entrar na NexFinance.",
        linkLabel: "Ir para o login",
        linkHref: "/login.html?verified=1",
      }));
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email, email_verified, email_verification_expires_at")
      .eq("email_verification_token_hash", tokenHash)
      .maybeSingle();

    if (userError || !user || new Date(user.email_verification_expires_at).getTime() < Date.now()) {
      return res.status(400).send(renderVerificationPage({
        title: "Link expirado",
        message: "Esse link de validação expirou ou já foi usado. Crie a conta novamente para receber um novo link.",
        linkLabel: "Voltar ao cadastro",
        linkHref: "/cadastro.html",
      }));
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        email_verification_token_hash: null,
        email_verification_expires_at: null,
      })
      .eq("id", user.id);

    if (updateError) {
      return res.status(500).send(renderVerificationPage({
        title: "Erro ao confirmar email",
        message: "Não foi possível ativar sua conta agora. Tente novamente em instantes.",
        linkLabel: "Voltar ao login",
        linkHref: "/login.html",
      }));
    }

    await supabase
      .from("companies")
      .update({ status: "active" })
      .eq("owner_id", user.id);

    removePendingRegistration(user.email);
    return res.status(200).send(renderVerificationPage({
      title: "Email confirmado",
      message: "Sua conta foi validada com sucesso. Agora você já pode entrar na NexFinance.",
      linkLabel: "Ir para o login",
      linkHref: "/login.html?verified=1",
    }));
  } catch (error) {
    console.error("Erro ao validar email:", error);
    return res.status(500).send(renderVerificationPage({
      title: "Erro na validação",
      message: "Não foi possível validar esse email agora. Tente novamente em instantes.",
      linkLabel: "Voltar ao login",
      linkHref: "/login.html",
    }));
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;

    const validation = validateLoginInput({ email, password });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Erro na validação.",
        errors: validation.errors,
      });
    }

    email = sanitizeInput(email).toLowerCase();

    if (pendingRegistrationsByEmail.has(email)) {
      return res.status(403).json({
        success: false,
        message: "Confirme seu email antes de fazer login. Enviamos um link de validação no cadastro.",
      });
    }

    if (!supabase) {
      const user = demoUsers.find((demoUser) => demoUser.email === email);
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        logSecurityEvent("login_failed", req, { email: maskEmail(email), mode: "demo" });
        return res.status(401).json({
          success: false,
          message: "Email ou senha incorretos.",
        });
      }

      return sendAuthResponse(res, 200, user, "Login realizado em modo demonstração.");
    }

    const { data: users, error: queryError } = await supabase
      .from("users")
      .select("id, name, email, company_name, password_hash, email_verified")
      .eq("email", email)
      .limit(1);

    if (queryError) {
      const demoUser = demoUsers.find((item) => item.email === email);
      if (demoUser && (await bcrypt.compare(password, demoUser.password_hash))) {
        return sendAuthResponse(res, 200, demoUser, "Supabase indisponível. Login realizado em modo demonstração.");
      }

      return res.status(500).json({
        success: false,
        message: "Erro na conexão com o banco.",
      });
    }

    const user = users?.[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      logSecurityEvent("login_failed", req, { email: maskEmail(email), mode: "database" });
      return res.status(401).json({
        success: false,
        message: "Email ou senha incorretos.",
      });
    }

    // Segurança: contas com email ainda não confirmado não podem autenticar.
    if (!isUserEmailVerified(user)) {
      return res.status(403).json({
        success: false,
        message: "Confirme seu email antes de fazer login.",
      });
    }

    return sendAuthResponse(res, 200, user, "Login realizado com sucesso.");
  } catch (error) {
    console.error("Erro no login:", error);
    const demoUser = demoUsers.find((item) => item.email === sanitizeInput(req.body.email || "").toLowerCase());
    if (demoUser && (await bcrypt.compare(req.body.password || "", demoUser.password_hash))) {
      return sendAuthResponse(res, 200, demoUser, "Supabase indisponível. Login realizado em modo demonstração.");
    }

    return res.status(500).json({
      success: false,
      message: "Erro interno no servidor ao fazer login.",
    });
  }
});

app.get("/api/auth/google/config", (req, res) => {
  return res.status(200).json({
    success: true,
    clientId: process.env.GOOGLE_CLIENT_ID || "",
  });
});

app.post("/api/auth/google", authLimiter, async (req, res) => {
  try {
    const { credential } = req.body;

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(400).json({
        success: false,
        message: "Google Login ainda não foi configurado. Adicione GOOGLE_CLIENT_ID no .env.",
      });
    }

    const googleProfile = await verifyGoogleCredential(credential);
    const email = sanitizeInput(googleProfile.email).toLowerCase();
    const name = sanitizeInput(googleProfile.name || email.split("@")[0]);

    if (!email || !googleProfile.email_verified) {
      return res.status(401).json({
        success: false,
        message: "Não foi possível confirmar esse email do Google.",
      });
    }

    const demoUser = demoUsers.find((user) => user.email === email);
    if (demoUser) {
      return sendAuthResponse(res, 200, demoUser, "Login com Google realizado com sucesso.");
    }

    if (supabase) {
      const { data: users, error } = await supabase
        .from("users")
        .select("id, name, email, company_name, password_hash")
        .eq("email", email)
        .limit(1);

      if (error) {
        return res.status(500).json({
          success: false,
          message: "Erro ao verificar sua conta Google no banco.",
        });
      }

      if (users?.[0]) {
        return sendAuthResponse(res, 200, users[0], "Login com Google realizado com sucesso.");
      }
    }

    const profileToken = jwt.sign(
      {
        purpose: "google_signup",
        email,
        name,
        picture: googleProfile.picture || "",
      },
      JWT_SECRET,
      { expiresIn: "15m" },
    );

    return res.status(200).json({
      success: true,
      requiresPassword: true,
      message: "Conta Google verificada. Crie uma senha para concluir seu cadastro.",
      profileToken,
      profile: {
        name,
        email,
        picture: googleProfile.picture || "",
      },
    });
  } catch (error) {
    console.error("Erro no login com Google:", error);
    return res.status(401).json({
      success: false,
      message: "Não foi possível validar sua conta Google.",
    });
  }
});

app.post("/api/auth/google/complete", authLimiter, async (req, res) => {
  try {
    const { profileToken, password, company = "Empresa NexFinance" } = req.body;

    if (!validateRegisterInput({ name: "Usuário Google", email: "google@nexfinance.com", password, company }).isValid) {
      return res.status(400).json({
        success: false,
        message: "A senha precisa ter exatamente 8 caracteres, com letras e números.",
      });
    }

    const profile = jwt.verify(profileToken, JWT_SECRET);
    if (profile.purpose !== "google_signup" || !profile.email) {
      return res.status(401).json({
        success: false,
        message: "Sessão do Google inválida. Selecione sua conta novamente.",
      });
    }

    const email = sanitizeInput(profile.email).toLowerCase();
    const name = sanitizeInput(profile.name || email.split("@")[0]);
    const companyName = sanitizeInput(company || "Empresa NexFinance");
    const existingDemoUser = demoUsers.find((user) => user.email === email);

    if (existingDemoUser) {
      return sendAuthResponse(res, 200, existingDemoUser, "Conta Google já existente. Login realizado.");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    if (!supabase) {
      const newUser = {
        id: `demo-google-${Date.now()}`,
        name,
        username: normalizeUsername("", email),
        email,
        company_name: companyName,
        password_hash: passwordHash,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      };

      demoUsers.push(newUser);
      return sendAuthResponse(res, 201, newUser, "Conta Google criada em modo demonstração.");
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id, name, email, company_name, password_hash")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return sendAuthResponse(res, 200, existingUser, "Conta Google já existente. Login realizado.");
    }

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert([{
        name,
        email,
        password_hash: passwordHash,
        company_name: companyName,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }])
      .select("id, name, email, company_name");

    if (insertError || !newUser?.length) {
      return res.status(500).json({
        success: false,
        message: "Não foi possível criar a conta com Google agora.",
      });
    }

    await supabase
      .from("companies")
      .insert([{ owner_id: newUser[0].id, name: companyName, cnpj: null, status: "active" }]);

    return sendAuthResponse(res, 201, newUser[0], "Conta Google criada com sucesso.");
  } catch (error) {
    console.error("Erro ao concluir cadastro Google:", error);
    return res.status(401).json({
      success: false,
      message: "Sessão do Google expirada. Selecione sua conta novamente.",
    });
  }
});

app.get("/api/auth/me", verifyToken, (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
});

app.get("/api/dashboard", verifyToken, async (req, res) => {
  if (!supabase) {
    return res.status(200).json({
      success: true,
      message: "Acesso autorizado em modo demonstração.",
      user: req.user,
      dashboard: demoDashboard(),
    });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, company_name")
      .eq("id", req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Acesso autorizado ao dashboard.",
      user,
      dashboard: demoDashboard(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erro ao carregar dashboard.",
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
  return res.status(200).json({
    success: true,
    message: "Sessão encerrada com segurança.",
  });
});

app.post("/api/auth/recover", authLimiter, handlePasswordRecovery);
app.post("/api/auth/forgot-password", authLimiter, handlePasswordRecovery);

async function handlePasswordRecovery(req, res) {
  try {
    const email = sanitizeInput(req.body.email || "").toLowerCase();
    let resetUrlForDev;

    if (!validateEmail(email)) {
      return res.status(200).json({
        success: true,
        message: "Se o email estiver cadastrado, as instruções serão enviadas.",
      });
    }

    const user = await findUserByEmail(email);
    if (user) {
      const reset = createPasswordResetToken();
      const resetUrl = `${getAppBaseUrl(req)}/api/auth/reset-password?token=${reset.token}`;
      resetUrlForDev = resetUrl;

      pendingPasswordResetsByToken.set(reset.tokenHash, {
        userId: user.id,
        email,
        expires_at: Date.now() + PASSWORD_RESET_EXPIRES_MS,
        used: false,
      });
      pendingPasswordResetsByEmail.set(email, reset.tokenHash);

      await sendPasswordResetEmail({ to: email, name: user.name || "usuário", resetUrl });
      logSecurityEvent("password_reset_requested", req, { email: maskEmail(email) });
    }

    return res.status(200).json({
      success: true,
      message: "Se o email estiver cadastrado, as instruções serão enviadas.",
      devResetUrl: shouldExposeDevVerificationUrl() ? resetUrlForDev : undefined,
    });
  } catch (error) {
    console.error("Erro na recuperação de senha:", error);
    return res.status(200).json({
      success: true,
      message: "Se o email estiver cadastrado, as instruções serão enviadas.",
    });
  }
}

app.get("/api/auth/reset-password", (req, res) => {
  const token = String(req.query.token || "");
  const tokenHash = hashToken(token);
  const reset = pendingPasswordResetsByToken.get(tokenHash);

  if (!reset || reset.used || reset.expires_at < Date.now()) {
    return res.status(400).send(renderVerificationPage({
      title: "Link inválido",
      message: "Esse link de recuperação expirou ou já foi usado. Solicite um novo link.",
      linkLabel: "Voltar ao login",
      linkHref: "/login.html",
    }));
  }

  return res.status(200).send(renderPasswordResetPage(token));
});

app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
  try {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const tokenHash = hashToken(token);
    const reset = pendingPasswordResetsByToken.get(tokenHash);

    if (!reset || reset.used || reset.expires_at < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "Link de recuperação inválido ou expirado.",
      });
    }

    if (password !== confirmPassword || !validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: "A nova senha precisa ter exatamente 8 caracteres, com letras e números.",
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await updateUserPassword(reset.email, passwordHash);

    reset.used = true;
    removePasswordReset(reset.email);
    logSecurityEvent("password_reset_completed", req, { email: maskEmail(reset.email) });

    return res.status(200).json({
      success: true,
      message: "Senha atualizada com sucesso. Você já pode entrar.",
    });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    return res.status(500).json({
      success: false,
      message: "Não foi possível atualizar a senha agora.",
    });
  }
});

app.post("/api/auth/recover-demo-disabled", authLimiter, (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Se o email estiver cadastrado, as instruções serão enviadas.",
  });
});

app.post("/api/ai/analyze", aiLimiter, verifyToken, async (req, res) => {
  try {
    const { module = "Dashboard", question = "Analise os dados e gere recomendações.", data = {} } = req.body;
    const safeData = summarizeBusinessDataForAi(data);

    if (!gemini) {
      return res.status(200).json({
        success: true,
        provider: "demo",
        answer: buildDemoAiAnswer(module, safeData, question),
      });
    }

    // Segurança: envia para IA externa apenas dados agregados, sem nomes, emails, telefones ou documentos.
    const prompt = buildNexFinancePrompt({ module, question, data: safeData });
    const result = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    return res.status(200).json({
      success: true,
      provider: "gemini",
      answer: result.text || "Não foi possível gerar uma resposta agora.",
    });
  } catch (error) {
    console.error("Erro na IA Gemini:", error);
    return res.status(200).json({
      success: true,
      provider: "demo",
      answer: buildDemoAiAnswer(req.body?.module || "Dashboard", req.body?.data || {}, req.body?.question || ""),
      warning: "Gemini indisponível. Resposta gerada em modo demonstração.",
    });
  }
});

app.post("/api/ai/recommendations", aiLimiter, verifyToken, async (req, res) => {
  try {
    const { data = {} } = req.body;
    const safeData = summarizeBusinessDataForAi(data);

    if (!gemini) {
      return res.status(200).json({
        success: true,
        provider: "demo",
        recommendations: buildDemoRecommendations(safeData),
      });
    }

    const prompt = buildNexFinancePrompt({
      module: "Recomendações IA",
      question: "Gere até 5 recomendações em JSON válido para o gestor.",
      data: safeData,
      json: true,
    });

    const result = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    return res.status(200).json({
      success: true,
      provider: "gemini",
      answer: result.text || "",
      recommendations: parseRecommendations(result.text),
    });
  } catch (error) {
    console.error("Erro nas recomendações Gemini:", error);
    return res.status(200).json({
      success: true,
      provider: "demo",
      recommendations: buildDemoRecommendations(req.body?.data || {}),
      warning: "Gemini indisponível. Recomendações geradas em modo demonstração.",
    });
  }
});

app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "Rota de API não encontrada.",
  });
});

function buildTrustedOrigins() {
  const configuredOrigins = [
    process.env.CLIENT_URL,
    process.env.APP_URL,
    process.env.CORS_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => normalizeOrigin(value.trim()))
    .filter(Boolean);

  return new Set([
    ...configuredOrigins,
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
  ]);
}

function buildCspDirectives() {
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "https://accounts.google.com", "https://apis.google.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "connect-src": ["'self'", "https://oauth2.googleapis.com", "https://accounts.google.com", "https://*.supabase.co"],
    "frame-src": ["'self'", "https://accounts.google.com"],
    "frame-ancestors": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };

  if (process.env.NODE_ENV === "production") {
    directives["upgrade-insecure-requests"] = [];
  }

  return directives;
}

function normalizeOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function isLocalhostOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function createEmailVerificationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashToken(token),
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function removePendingRegistration(email) {
  const tokenHash = pendingRegistrationsByEmail.get(email);
  if (tokenHash) {
    pendingRegistrationsByToken.delete(tokenHash);
  }
  pendingRegistrationsByEmail.delete(email);
}

function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashToken(token),
  };
}

function removePasswordReset(email) {
  const tokenHash = pendingPasswordResetsByEmail.get(email);
  if (tokenHash) {
    pendingPasswordResetsByToken.delete(tokenHash);
  }
  pendingPasswordResetsByEmail.delete(email);
}

async function findUserByEmail(email) {
  const demoUser = demoUsers.find((user) => user.email === email);
  if (demoUser) return demoUser;

  if (!supabase) return null;

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, company_name, password_hash, email_verified")
    .eq("email", email)
    .maybeSingle();

  if (error) return null;
  return user;
}

async function updateUserPassword(email, passwordHash) {
  const demoUser = demoUsers.find((user) => user.email === email);
  if (demoUser) {
    demoUser.password_hash = passwordHash;
    return;
  }

  if (!supabase) {
    throw new Error("Banco de dados indisponível para atualizar senha.");
  }

  const { error } = await supabase
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("email", email);

  if (error) {
    throw error;
  }
}

function getAppBaseUrl(req) {
  return normalizeOrigin(process.env.APP_URL || `${req.protocol}://${req.get("host")}`);
}

function hasEmailProvider() {
  return Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY);
}

function shouldExposeDevVerificationUrl() {
  return process.env.NODE_ENV !== "production" && !hasEmailProvider();
}

function maskEmail(email) {
  const [user, domain] = String(email || "").split("@");
  if (!user || !domain) return "email_invalido";
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(user.length - 2, 2))}@${domain}`;
}

function isUserEmailVerified(user = {}) {
  if (user.email_verified === false || user.emailVerified === false) return false;
  return true;
}

function logSecurityEvent(event, req, metadata = {}) {
  const payload = {
    type: "security",
    event,
    ip: req.ip,
    route: req.originalUrl,
    userAgent: req.get("user-agent"),
    at: new Date().toISOString(),
    ...metadata,
  };

  console.info(JSON.stringify(payload));
}

async function verifyGoogleCredential(credential) {
  if (!credential) {
    throw new Error("Credencial Google não enviada.");
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) {
    throw new Error("Token Google inválido.");
  }

  const profile = await response.json();
  if (profile.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new Error("Cliente Google inválido.");
  }

  return {
    email: profile.email,
    email_verified: profile.email_verified === true || profile.email_verified === "true",
    name: profile.name,
    picture: profile.picture,
  };
}

async function sendVerificationEmail({ to, name, verificationUrl }) {
  const apiKey = (process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY || "").trim();
  const from = process.env.EMAIL_FROM || "NexFinance <onboarding@resend.dev>";

  if (!apiKey) {
    console.log("\n========================================");
    console.log("Validacao de email em modo local");
    console.log(`Email: ${to}`);
    console.log(`Link: ${verificationUrl}`);
    console.log("Configure RESEND_API_KEY e EMAIL_FROM no .env para enviar email de verdade.");
    console.log("========================================\n");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Confirme seu email na NexFinance",
      html: buildVerificationEmailHtml({ name, verificationUrl }),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Erro ao enviar email de validacao: ${details}`);
  }
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const apiKey = (process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY || "").trim();
  const from = process.env.EMAIL_FROM || "NexFinance <onboarding@resend.dev>";

  if (!apiKey) {
    console.log("\n========================================");
    console.log("Recuperacao de senha em modo local");
    console.log(`Email: ${to}`);
    console.log(`Link: ${resetUrl}`);
    console.log("Configure RESEND_API_KEY e EMAIL_FROM no .env para enviar email de verdade.");
    console.log("========================================\n");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Redefina sua senha na NexFinance",
      html: buildPasswordResetEmailHtml({ name, resetUrl }),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Erro ao enviar email de recuperacao: ${details}`);
  }
}

function buildVerificationEmailHtml({ name, verificationUrl }) {
  return `
    <div style="margin:0;padding:32px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#061b2e;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;box-shadow:0 24px 60px rgba(15,23,42,.08);">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#00a892;">NexFinance</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;color:#061b2e;">Confirme seu email</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#475569;">Ola, ${escapeHtml(name)}. Para ativar sua conta e acessar a plataforma, confirme o email cadastrado.</p>
        <a href="${verificationUrl}" style="display:inline-block;margin:8px 0 20px;padding:14px 22px;border-radius:12px;background:linear-gradient(135deg,#00334d,#00bfa6);color:#ffffff;text-decoration:none;font-weight:800;">Confirmar email</a>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">Esse link expira em 24 horas. Se voce nao criou essa conta, ignore esta mensagem.</p>
      </div>
    </div>
  `;
}

function buildPasswordResetEmailHtml({ name, resetUrl }) {
  return `
    <div style="margin:0;padding:32px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#061b2e;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;box-shadow:0 24px 60px rgba(15,23,42,.08);">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#00a892;">NexFinance</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;color:#061b2e;">Redefina sua senha</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#475569;">Ola, ${escapeHtml(name)}. Recebemos uma solicitação para redefinir sua senha.</p>
        <a href="${resetUrl}" style="display:inline-block;margin:8px 0 20px;padding:14px 22px;border-radius:12px;background:linear-gradient(135deg,#00334d,#00bfa6);color:#ffffff;text-decoration:none;font-weight:800;">Criar nova senha</a>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">Esse link expira em 1 hora e só pode ser usado uma vez. Se voce nao pediu isso, ignore esta mensagem.</p>
      </div>
    </div>
  `;
}

function renderVerificationPage({ title, message, linkLabel, linkHref }) {
  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)} | NexFinance</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Manrope:wght@700;800&display=swap" rel="stylesheet">
        <style>
          body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#061b2e;font-family:Inter,Arial,sans-serif;padding:24px}
          main{max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:34px;box-shadow:0 24px 60px rgba(15,23,42,.08)}
          strong{display:block;color:#00a892;margin-bottom:10px}
          h1{font-family:Manrope,Inter,sans-serif;font-size:34px;line-height:1.05;margin:0 0 12px}
          p{font-size:16px;line-height:1.6;color:#64748b;margin:0 0 24px}
          a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:12px;background:linear-gradient(135deg,#00334d,#00bfa6);color:#fff;text-decoration:none;font-weight:800}
        </style>
      </head>
      <body>
        <main>
          <strong>NexFinance</strong>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
          <a href="${linkHref}">${escapeHtml(linkLabel)}</a>
        </main>
      </body>
    </html>
  `;
}

function renderPasswordResetPage(token) {
  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Redefinir senha | NexFinance</title>
        <style>
          body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#061b2e;font-family:Inter,Arial,sans-serif;padding:24px}
          main{width:min(100%,480px);background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:34px;box-shadow:0 24px 60px rgba(15,23,42,.08)}
          strong{display:block;color:#00a892;margin-bottom:10px}
          h1{font-size:32px;line-height:1.05;margin:0 0 12px}
          p{font-size:15px;line-height:1.6;color:#64748b;margin:0 0 22px}
          label{display:block;font-weight:700;margin:14px 0 8px}
          input{width:100%;height:48px;border:1px solid #e2e8f0;border-radius:12px;padding:0 14px;font-size:15px;box-sizing:border-box}
          button{width:100%;height:50px;margin-top:18px;border:0;border-radius:12px;background:linear-gradient(135deg,#00334d,#00bfa6);color:#fff;font-weight:800;font-size:15px;cursor:pointer}
        </style>
      </head>
      <body>
        <main>
          <strong>NexFinance</strong>
          <h1>Crie uma nova senha</h1>
          <p>Use uma senha com exatamente 8 caracteres, incluindo letras e números.</p>
          <form method="post" action="/api/auth/reset-password">
            <input type="hidden" name="token" value="${escapeHtml(token)}">
            <label for="password">Nova senha</label>
            <input id="password" name="password" type="password" minlength="8" maxlength="8" autocomplete="new-password" required>
            <label for="confirmPassword">Confirmar senha</label>
            <input id="confirmPassword" name="confirmPassword" type="password" minlength="8" maxlength="8" autocomplete="new-password" required>
            <button type="submit">Atualizar senha</button>
          </form>
        </main>
      </body>
    </html>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUsername(username, email) {
  const rawUsername = sanitizeInput(username || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, ".")
    .replace(/[.]{2,}/g, ".")
    .replace(/^\.|\.$/g, "");
  const fallback = String(email || "")
    .split("@")[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, ".")
    .replace(/[.]{2,}/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 24);

  return (rawUsername || fallback || "usuario").slice(0, 24);
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : "";
  const token = bearerToken || readCookie(req, AUTH_COOKIE_NAME);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token não enviado.",
    });
  }

  if (token === "demo-presentation-token" && process.env.NODE_ENV !== "production") {
    req.user = {
      id: "demo",
      email: "teste@nexfinance.com",
      name: "Usuário Teste",
      company: "NexFoods Comércio LTDA",
    };
    return next();
  }

  try {
    // Segurança: valida assinatura e expiração do JWT em toda rota privada.
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token expirado ou inválido.",
    });
  }
}

function sendAuthResponse(res, status, user, message) {
  const response = makeAuthResponse(user, message);
  setAuthCookie(res, response.token);
  delete response.token;
  return res.status(status).json(response);
}

function makeAuthResponse(user, message) {
  const username = normalizeUsername(user.username || user.name, user.email);
  const displayName = user.display_name || user.name || username;

  // Segurança: o JWT expira em curto prazo e é enviado em cookie httpOnly por sendAuthResponse.
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: displayName,
      username,
      company: user.company_name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

  return {
    success: true,
    message,
    token,
    user: {
      id: user.id,
      name: displayName,
      username,
      displayName,
      email: user.email,
      company: user.company_name,
    },
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

function readCookie(req, name) {
  const rawCookie = req.headers.cookie || "";
  const cookie = rawCookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) return "";
  return decodeURIComponent(cookie.split("=").slice(1).join("="));
}

function resolveJwtSecret() {
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET ou SUPABASE_JWT_SECRET precisa estar configurado em produção.");
  }

  console.warn("JWT_SECRET não configurado. Usando segredo temporário apenas para desenvolvimento local.");
  return crypto.randomBytes(48).toString("hex");
}

function demoDashboard() {
  return {
    receitaTotal: 486240,
    despesasTotais: 279880,
    lucroLiquido: 206360,
    scoreFinanceiro: 86,
  };
}

function summarizeBusinessDataForAi(data = {}) {
  const count = (value) => Array.isArray(value) ? value.length : 0;
  const toNumber = (value) => {
    if (typeof value === "number") return value;
    const parsed = Number(String(value || "").replace(/[^\d,-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const sumValues = (rows = []) => rows.reduce((total, row) => {
    if (Array.isArray(row)) {
      return total + row.reduce((innerTotal, item) => innerTotal + toNumber(item), 0);
    }

    if (row && typeof row === "object") {
      return total + Object.values(row).reduce((innerTotal, item) => innerTotal + toNumber(item), 0);
    }

    return total;
  }, 0);

  const estoque = data.estoque || data.stock || [];
  const fornecedores = data.fornecedores || data.suppliers || [];
  const vendas = data.vendas || data.sales || [];
  const financeiro = data.lancamentosFinanceiros || [];

  // Segurança: não envia nomes, emails, telefones, documentos ou descrições livres para provedores externos de IA.
  return {
    totais: {
      clientes: count(data.clientes),
      estoque: count(estoque),
      fornecedores: count(fornecedores),
      vendas: count(vendas),
      lancamentosFinanceiros: count(financeiro),
      folha: count(data.folha),
      patrimonio: count(data.patrimonio),
    },
    indicadores: {
      vendasEstimadas: sumValues(vendas),
      financeiroEstimado: sumValues(financeiro),
      estoqueEstimado: sumValues(estoque),
      capitalDeGiro: sanitizeInput(data?.capitalDeGiro?.gapProjetado || ""),
    },
    perfilNegocio: {
      tipo: sanitizeInput(data?.perfil?.businessType || data?.perfil?.tipo || ""),
      risco: sanitizeInput(data?.perfil?.riskProfile || data?.perfil?.perfil || ""),
      objetivo: sanitizeInput(data?.perfil?.goal || data?.perfil?.objetivo || ""),
    },
  };
}

function buildNexFinancePrompt({ module, question, data, json = false }) {
  return `
Você é o Assistente IA da NexFinance, um copiloto financeiro e operacional para pequenos negócios, comerciantes e microempreendedores.

Sua função é analisar dados do negócio e transformar informações em recomendações práticas, simples e úteis para o gestor tomar melhores decisões.

Tom obrigatório:
- profissional;
- simples;
- direto;
- confiável;
- consultivo;
- educativo;
- sem linguagem difícil;
- sem prometer lucro garantido.

Regras:
- Não apenas descreva os dados. Interprete e oriente o gestor sobre o que fazer.
- Se os dados forem insuficientes, diga quais dados estão faltando.
- Não invente números que não foram enviados.
- Se estimar algo, deixe claro que é uma estimativa.
- Sempre priorize ações práticas.
- Nunca dê recomendação financeira irresponsável.
- Sempre explique o motivo da recomendação.

Formato obrigatório da resposta:
### Problema identificado
### Impacto no negócio
### Nível de risco
Classifique como Baixo, Médio, Alto ou Crítico.
### Ação recomendada
### Próximo passo
### Dados usados na análise

${json ? `Quando possível, também inclua um bloco JSON válido com:
{
  "problema": "...",
  "impacto": "...",
  "risco": "Baixo | Médio | Alto | Crítico",
  "acao_recomendada": "...",
  "proximo_passo": "...",
  "dados_usados": ["..."],
  "categoria": "Financeiro | Estoque | Clientes | Fornecedores | Vendas | Folha | Patrimônio | Investidor",
  "prioridade": "Baixa | Média | Alta | Crítica"
}` : ""}

Módulo analisado: ${module}
Pergunta do usuário: ${question}

Dados recebidos:
${JSON.stringify(data, null, 2)}
`;
}

function buildDemoAiAnswer(module, data, question) {
  const stock = data?.estoque || data?.stock || [];
  const suppliers = data?.fornecedores || data?.suppliers || [];
  const sales = data?.vendas || data?.sales || [];
  const lowStockCount = Array.isArray(stock)
    ? stock.filter((row) => JSON.stringify(row).toLowerCase().includes("ruptura")).length
    : 0;

  const supplierRisk = Array.isArray(suppliers)
    ? suppliers.filter((row) => Number.parseInt(String(row?.[2] || row?.score || "100"), 10) < 85).length
    : 0;

  return `### Problema identificado
${lowStockCount > 0 ? `Foram encontrados ${lowStockCount} produto(s) com risco de ruptura no estoque.` : "Os dados indicam que a empresa precisa acompanhar caixa, estoque e fornecedores de forma integrada."}

### Impacto no negócio
${lowStockCount > 0 ? "Produto em ruptura pode gerar perda de vendas, queda de faturamento e insatisfação de clientes." : "Sem acompanhamento integrado, o gestor pode tomar decisões atrasadas sobre compras, vendas e pagamentos."}

### Nível de risco
${lowStockCount > 0 || supplierRisk > 0 ? "Alto. Há sinais operacionais que podem afetar vendas ou margem." : "Médio. Os dados exigem acompanhamento, mas não indicam crise imediata."}

### Ação recomendada
${supplierRisk > 0 ? "Abra uma cotação com fornecedores alternativos e compare prazo, preço e confiabilidade antes da próxima compra." : "Priorize os itens de maior giro e revise compras antes de assumir novos compromissos financeiros."}

### Próximo passo
Revise hoje os produtos em ruptura e entre em contato com o fornecedor de melhor prazo.

### Dados usados na análise
- Módulo: ${module}
- Pergunta: ${question || "Análise automática"}
- Itens de estoque: ${Array.isArray(stock) ? stock.length : 0}
- Fornecedores: ${Array.isArray(suppliers) ? suppliers.length : 0}
- Vendas: ${Array.isArray(sales) ? sales.length : 0}`;
}

function buildDemoRecommendations(data) {
  const stock = data?.estoque || data?.stock || [];
  const suppliers = data?.fornecedores || data?.suppliers || [];
  const lowStockCount = Array.isArray(stock)
    ? stock.filter((row) => JSON.stringify(row).toLowerCase().includes("ruptura")).length
    : 0;
  const weakSuppliers = Array.isArray(suppliers)
    ? suppliers.filter((row) => Number.parseInt(String(row?.[2] || row?.score || "100"), 10) < 85).length
    : 0;

  return [
    {
      problema: lowStockCount ? `${lowStockCount} produto(s) com risco de ruptura.` : "Estoque precisa de acompanhamento preventivo.",
      impacto: "Pode afetar vendas e atendimento ao cliente.",
      risco: lowStockCount ? "Alto" : "Médio",
      acao_recomendada: "Priorizar reposição dos itens de maior giro.",
      proximo_passo: "Abrir o módulo de estoque e revisar produtos abaixo do mínimo.",
      dados_usados: ["estoque", "vendas"],
      categoria: "Estoque",
      prioridade: lowStockCount ? "Alta" : "Média",
    },
    {
      problema: weakSuppliers ? "Há fornecedores com score abaixo do ideal." : "Fornecedores devem ser comparados periodicamente.",
      impacto: "Prazos ruins ou preços maiores pressionam o caixa.",
      risco: weakSuppliers ? "Alto" : "Baixo",
      acao_recomendada: "Abrir cotação com fornecedores alternativos.",
      proximo_passo: "Comparar prazo, preço e confiabilidade dos fornecedores.",
      dados_usados: ["fornecedores", "capital de giro"],
      categoria: "Fornecedores",
      prioridade: weakSuppliers ? "Alta" : "Média",
    },
  ];
}

function parseRecommendations(text = "") {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function buildNexFinancePrompt({ module, question, data, json = false }) {
  return `
Voce e o Assistente IA da NexFinance, um copiloto financeiro, operacional e estrategico para pequenos negocios, comerciantes, MEIs e microempreendedores.

Sua funcao e ajudar o usuario a entender melhor o negocio, tirar duvidas, analisar dados e sugerir decisoes praticas com base em informacoes reais.
Voce nao e apenas uma IA que entrega relatorios. Voce conversa com o usuario, entende a duvida, interpreta o contexto e conduz a resposta ate uma conclusao util.

Tom obrigatorio:
- profissional, simples, direto e humano;
- acolhedor, racional, consultivo e educativo;
- linguagem acessivel para pequenos empreendedores;
- sem arrogancia, sem termos tecnicos desnecessarios e sem prometer resultado garantido.

Comportamento principal:
1. Responda saudacoes naturalmente.
2. Tente entender a duvida antes de responder.
3. Se a pergunta estiver incompleta, peca apenas os dados necessarios.
4. Analise os dados de forma racional.
5. Explique o raciocinio em linguagem simples.
6. Mostre problema, impacto, risco e acao recomendada.
7. Conclua com um proximo passo claro.
8. Pergunte se o usuario quer aprofundar a analise quando fizer sentido.

Se o usuario disser apenas "Oi", "Bom dia" ou "Me ajuda", responda de forma conversacional e pergunte qual ponto ele quer analisar: financas, caixa, estoque, vendas, clientes, fornecedores, folha, patrimonio ou uma decisao especifica.

Voce pode receber dados de:
- financeiro: receita, despesas, lucro, caixa, contas a pagar, contas a receber, capital de giro, endividamento, margem, ticket medio e projecao de caixa;
- vendas: vendas por periodo, produtos mais vendidos, canais, marketplace, conversao, cancelamentos, devolucoes e sazonalidade;
- estoque: produtos, quantidade, estoque minimo, alto giro, ruptura, perdas, validade, custo, preco e margem;
- clientes: clientes ativos, inativos, recorrencia, historico, ticket medio, abandono e fidelizacao;
- fornecedores: prazos, preco medio, confiabilidade, pagamento, atrasos e renegociacao;
- folha de pagamento: colaboradores, salarios, beneficios, descontos, encargos e impacto no lucro;
- patrimonio: ativos, equipamentos, veiculos, softwares, valor patrimonial, depreciacao e manutencao;
- perfil do negocio/investidor: tipo de negocio, perfil de risco, capital disponivel, objetivo, setor, retorno esperado e horizonte.

Regras:
- Responda a pergunta direta do usuario primeiro sempre que possivel.
- Interprete os dados, nao apenas repita numeros.
- Nao invente numeros, prazos, percentuais ou resultados.
- Se estimar algo, diga que e uma estimativa.
- Se houver risco, deixe claro.
- Em credito, divida ou investimento, seja conservador e explique os riscos.
- A IA apoia a decisao, mas nao substitui o gestor.
- Evite frases frias como "Com base nos dados fornecidos" ou "Recomenda-se otimizar processos".
- Prefira frases humanas como "Pelo que estou vendo", "Antes de tomar uma decisao, eu olharia para dois pontos" e "Minha recomendacao e comecar pela acao mais simples e com maior impacto".

Quando faltarem dados, diga:
"Consigo te ajudar, mas para uma analise mais segura preciso de alguns dados."
Depois liste somente os dados essenciais para concluir a duvida.

Forma de raciocinio:
Explique de modo organizado, sem mostrar pensamento interno oculto:
1. o que esta acontecendo;
2. por que isso importa;
3. qual risco existe;
4. o que fazer primeiro;
5. o que acompanhar depois.

Formato padrao quando o usuario pedir analise, recomendacao ou decisao:
### Entendimento da duvida
### Analise racional
### Problema ou oportunidade identificada
### Impacto no negocio
### Nivel de risco
Classifique como Baixo, Medio, Alto ou Critico e explique rapidamente.
### Acao recomendada
### Proximo passo
### Conclusao
### Dados usados na analise

${json ? `Quando possivel, inclua tambem um bloco JSON valido com:
{
  "entendimento_da_duvida": "...",
  "analise_racional": "...",
  "problema_ou_oportunidade": "...",
  "impacto": "...",
  "risco": "Baixo | Medio | Alto | Critico",
  "acao_recomendada": "...",
  "proximo_passo": "...",
  "conclusao": "...",
  "dados_usados": ["..."],
  "dados_faltantes": ["..."],
  "categoria": "Financeiro | Estoque | Clientes | Fornecedores | Vendas | Folha | Patrimonio | Investidor | Geral",
  "prioridade": "Baixa | Media | Alta | Critica"
}` : ""}

Modulo analisado: ${module}
Pergunta do usuario: ${question}

Dados recebidos:
${JSON.stringify(data, null, 2)}
`;
}

function buildDemoAiAnswer(module, data, question) {
  const stock = data?.estoque || data?.stock || [];
  const suppliers = data?.fornecedores || data?.suppliers || [];
  const sales = data?.vendas || data?.sales || [];
  const lowStockCount = Array.isArray(stock)
    ? stock.filter((row) => JSON.stringify(row).toLowerCase().includes("ruptura")).length
    : 0;
  const supplierRisk = Array.isArray(suppliers)
    ? suppliers.filter((row) => Number.parseInt(String(row?.[2] || row?.score || "100"), 10) < 85).length
    : 0;

  return `### Entendimento da duvida
Voce quer uma leitura pratica do modulo ${module} para entender o que merece atencao agora.

### Analise racional
Pelo que estou vendo, o ponto principal e cruzar estoque, fornecedores e vendas. Se o produto vende bem, mas esta perto de faltar, o problema nao e demanda: e reposicao e prazo de compra.

### Problema ou oportunidade identificada
${lowStockCount > 0 ? `Foram encontrados ${lowStockCount} produto(s) com risco de ruptura no estoque.` : "Existe oportunidade de organizar melhor as decisoes entre compras, vendas e caixa."}

### Impacto no negocio
${lowStockCount > 0 ? "Produto em ruptura pode gerar perda de vendas, queda de faturamento e insatisfacao de clientes." : "Sem acompanhamento integrado, o gestor pode tomar decisoes atrasadas sobre compras, vendas e pagamentos."}

### Nivel de risco
${lowStockCount > 0 || supplierRisk > 0 ? "Alto. Ha sinais operacionais que podem afetar vendas ou margem." : "Medio. Os dados exigem acompanhamento, mas nao indicam crise imediata."}

### Acao recomendada
${supplierRisk > 0 ? "Abra uma cotacao com fornecedores alternativos e compare prazo, preco e confiabilidade antes da proxima compra." : "Priorize os itens de maior giro e revise compras antes de assumir novos compromissos financeiros."}

### Proximo passo
Revise hoje os produtos em ruptura e entre em contato com o fornecedor de melhor prazo.

### Conclusao
Minha recomendacao e comecar pela acao mais simples e com maior impacto: proteger os produtos que vendem mais e evitar falta no estoque.

### Dados usados na analise
- Modulo: ${module}
- Pergunta: ${question || "Analise automatica"}
- Itens de estoque: ${Array.isArray(stock) ? stock.length : 0}
- Fornecedores: ${Array.isArray(suppliers) ? suppliers.length : 0}
- Vendas: ${Array.isArray(sales) ? sales.length : 0}`;
}

function parseRecommendations(text = "") {
  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  const jsonMatch = fencedJson || text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(fencedJson ? jsonMatch[1] : jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function buildNexFinancePrompt({ module, question, data, json = false }) {
  return `
Voce e o Assistente IA da NexFinance, chamado Nexy.

Voce atua como uma pessoa consultora financeira e operacional para pequenos negocios, comerciantes, MEIs e microempreendedores.
Sua missao e ajudar o usuario a entender melhor o negocio, organizar duvidas, analisar dados e tomar decisoes mais seguras.

Regra principal:
Converse primeiro. Estruture depois.
Nao obrigue toda resposta a virar relatorio. Use estrutura somente quando o usuario pedir analise completa, diagnostico, relatorio, plano de acao ou enviar dados suficientes para uma decisao.

Antes de responder, identifique o tipo da mensagem:
1. Modo conversa:
- Use para saudacoes, duvidas simples e quando o usuario estiver confuso.
- Responda de forma natural, curta, clara e acolhedora.
- Nao use titulos em excesso.
- Nao transforme tudo em lista.
- Nao responda como formulario.

2. Modo analise:
- Use quando o usuario enviar numeros/dados, pedir diagnostico, decisao, relatorio, simulacao, recomendacao detalhada ou plano.
- Use uma estrutura organizada, mas com linguagem natural.

Regras simples de classificacao:
- Se a mensagem tiver menos de 5 palavras ou for saudacao, responda em modo conversa.
- Se tiver numeros, dados financeiros, valores, prazos ou indicadores, responda em modo analise.
- Se pedir "relatorio", "diagnostico", "plano", "analise completa" ou "decisao", responda estruturado.

Como responder em saudacoes:
Exemplo:
Usuario: Oi
Resposta:
Oi! Sou o Nexy, assistente da NexFinance. Posso te ajudar a entender caixa, vendas, estoque, fornecedores ou decisoes do negocio. O que voce quer analisar agora?

Como responder duvidas simples:
- Responda primeiro a duvida de forma direta.
- Explique em linguagem simples.
- Se faltar informacao, peca apenas o essencial.
Exemplo de tom:
"Isso e mais comum do que parece. Vender bem nao significa necessariamente ter caixa saudavel. Pode ser que o dinheiro esteja preso em estoque, contas a receber, despesas altas ou prazos ruins com fornecedores."

Se o usuario estiver confuso:
- Ajude a organizar o pensamento antes de analisar.
- Ofereca caminhos simples.
Exemplo:
"Vamos por partes. Antes de pensar em uma decisao grande, precisamos descobrir onde esta o maior problema hoje: vendas, caixa, estoque, despesas, contas atrasadas ou crescimento."

Quando houver dados e pedido de analise, use este formato:
- O que eu percebi
- Por que isso importa
- Risco
- Minha recomendacao
- Primeiro passo
- Resumo

Quando faltarem dados:
Nao invente.
Diga:
"Para te responder com seguranca, preciso de algumas informacoes."
Depois peca somente os dados necessarios.

Dados que voce pode analisar:
- vendas;
- estoque;
- fornecedores;
- caixa;
- contas a pagar;
- contas a receber;
- folha de pagamento;
- patrimonio;
- perfil do investidor;
- perfil do negocio;
- capital de giro;
- clientes;
- marketplace;
- relatorios.

O que voce pode entregar:
- explicacoes simples;
- alertas;
- recomendacoes;
- plano de acao;
- analise de risco;
- simulacoes;
- relatorios quando o usuario pedir;
- proximos passos.

Tom obrigatorio:
- humano;
- simples;
- profissional;
- racional;
- direto;
- consultivo;
- proximo;
- sem exageros;
- sem prometer lucro;
- sem linguagem dificil.

Frases que voce pode usar:
- "Pelo que voce descreveu, o ponto principal parece ser..."
- "Antes de decidir, eu olharia para..."
- "Isso pode indicar..."
- "Minha recomendacao seria comecar por..."
- "O primeiro passo mais seguro e..."
- "Ainda nao da para concluir com seguranca, mas ja da para observar..."
- "Me passa esses dados que eu te ajudo a fechar a analise."

Frases que voce deve evitar:
- "Com base nos dados fornecidos..."
- "Segue a analise solicitada..."
- "Recomenda-se realizar..."
- "O usuario deve proceder..."
- "Analise concluida com sucesso..."
- "De acordo com os parametros..."

Regras de seguranca:
- Nao invente dados, numeros ou previsoes.
- Nao prometa lucro.
- Nao diga que uma decisao e 100% segura.
- Se envolver credito, divida ou investimento, seja conservador e explique o risco.
- A IA apoia o gestor, mas nao substitui a decisao dele.

${json ? `Quando o sistema pedir recomendacoes estruturadas, inclua um bloco JSON valido com este formato:
{
  "entendimento_da_duvida": "...",
  "analise_racional": "...",
  "problema_ou_oportunidade": "...",
  "impacto": "...",
  "risco": "Baixo | Medio | Alto | Critico",
  "acao_recomendada": "...",
  "proximo_passo": "...",
  "conclusao": "...",
  "dados_usados": ["..."],
  "dados_faltantes": ["..."],
  "categoria": "Financeiro | Estoque | Clientes | Fornecedores | Vendas | Folha | Patrimonio | Investidor | Geral",
  "prioridade": "Baixa | Media | Alta | Critica"
}` : ""}

Modulo atual: ${module}
Mensagem do usuario: ${question}

Dados recebidos:
${JSON.stringify(data, null, 2)}
`;
}

function buildDemoAiAnswer(module, data, question) {
  const message = String(question || "").trim();
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = normalized.split(/\s+/).filter(Boolean);
  const isGreeting = /^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|eai|hey|hello|hi)$/.test(normalized);
  const isConfused = /(me ajuda|nao sei|não sei|estou perdido|to perdido|tô perdido|o que faco|o que faço)/.test(normalized);
  const asksStructured = /(relatorio|relatório|diagnostico|diagnóstico|plano|analise completa|análise completa|decisao|decisão)/.test(normalized);
  const hasNumbers = /\d/.test(message);

  if (isGreeting || (!hasNumbers && !asksStructured && words.length > 0 && words.length < 5)) {
    return "Oi! Sou o Nexy, assistente da NexFinance. Posso te ajudar a entender caixa, vendas, estoque, fornecedores ou decisões do negócio. O que você quer analisar agora?";
  }

  if (isConfused) {
    return `Vamos por partes. Antes de pensar em uma decisão grande, precisamos descobrir onde está o maior problema hoje.

Me diga qual dessas situações parece mais próxima:
1. está vendendo pouco;
2. vende, mas não sobra dinheiro;
3. falta produto no estoque;
4. tem muita despesa;
5. está com contas atrasadas;
6. quer crescer, mas não sabe se é seguro.

Com isso eu consigo te orientar melhor.`;
  }

  if (!hasNumbers && !asksStructured && words.length < 14) {
    return "Consigo te ajudar. Me diga um pouco mais sobre o que você quer analisar: caixa, vendas, estoque, clientes, fornecedores, folha de pagamento ou capital de giro?";
  }

  const stock = data?.estoque || data?.stock || [];
  const suppliers = data?.fornecedores || data?.suppliers || [];
  const sales = data?.vendas || data?.sales || [];
  const lowStockCount = Array.isArray(stock)
    ? stock.filter((row) => JSON.stringify(row).toLowerCase().includes("ruptura")).length
    : 0;
  const supplierRisk = Array.isArray(suppliers)
    ? suppliers.filter((row) => Number.parseInt(String(row?.[2] || row?.score || "100"), 10) < 85).length
    : 0;

  return `O que eu percebi:
${lowStockCount > 0 ? `Existem ${lowStockCount} produto(s) com risco de ruptura no estoque.` : "O negócio precisa acompanhar caixa, estoque, vendas e fornecedores de forma integrada."}

Por que isso importa:
${lowStockCount > 0 ? "Quando um produto de giro fica perto de faltar, a empresa pode perder vendas mesmo tendo demanda." : "Sem essa visão integrada, uma decisão de compra ou venda pode apertar o caixa sem o gestor perceber a tempo."}

Risco:
${lowStockCount > 0 || supplierRisk > 0 ? "Alto, porque há sinais que podem afetar vendas, margem ou prazo de reposição." : "Médio, porque os dados pedem acompanhamento, mas não mostram uma crise imediata."}

Minha recomendação:
${supplierRisk > 0 ? "Comece abrindo cotação com fornecedores alternativos e compare prazo, preço e confiabilidade antes da próxima compra." : "Priorize os itens de maior giro e revise compras antes de assumir novos compromissos financeiros."}

Primeiro passo:
Revise hoje os produtos em ruptura e veja qual fornecedor consegue repor com melhor prazo.

Resumo:
Minha recomendação é começar pela ação mais simples e com maior impacto: proteger os produtos que mais vendem e evitar falta no estoque.

Dados usados:
- Módulo: ${module}
- Pergunta: ${question || "Análise automática"}
- Itens de estoque: ${Array.isArray(stock) ? stock.length : 0}
- Fornecedores: ${Array.isArray(suppliers) ? suppliers.length : 0}
- Vendas: ${Array.isArray(sales) ? sales.length : 0}`;
}

function buildDemoAiAnswer(module, data, question) {
  const message = String(question || "").trim();
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = normalized.split(/\s+/).filter(Boolean);
  const isGreeting = /^(oi|ola|bom dia|boa tarde|boa noite|e ai|eai|hey|hello|hi)$/.test(normalized);
  const isConfused = /(me ajuda|nao sei|estou perdido|to perdido|to perdido|o que faco)/.test(normalized);
  const asksStructured = /(relatorio|diagnostico|plano|analise completa|decisao|capital|estoque|financeiro|caixa|vendas)/.test(normalized);
  const hasNumbers = /\d/.test(message);
  const hasBusinessData = [
    data?.estoque,
    data?.stock,
    data?.fornecedores,
    data?.suppliers,
    data?.vendas,
    data?.sales,
    data?.lancamentosFinanceiros,
    data?.capitalDeGiro?.planoDeAcao,
    data?.folha,
    data?.patrimonio,
    data?.clientes,
  ].some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));

  if (!hasBusinessData && (isGreeting || (!hasNumbers && !asksStructured && words.length > 0 && words.length < 5))) {
    return "Oi! Sou o Nexy, assistente da NexFinance. Posso te ajudar a entender caixa, vendas, estoque, fornecedores ou decisões do negócio. O que você quer analisar agora?";
  }

  if (!hasBusinessData && isConfused) {
    return `Vamos por partes. Antes de pensar em uma decisão grande, precisamos descobrir onde está o maior problema hoje.

Me diga qual dessas situações parece mais próxima:
1. está vendendo pouco;
2. vende, mas não sobra dinheiro;
3. falta produto no estoque;
4. tem muita despesa;
5. está com contas atrasadas;
6. quer crescer, mas não sabe se é seguro.

Com isso eu consigo te orientar melhor.`;
  }

  if (!hasBusinessData && !hasNumbers && !asksStructured && words.length < 14) {
    return "Consigo te ajudar. Me diga um pouco mais sobre o que você quer analisar: caixa, vendas, estoque, clientes, fornecedores, folha de pagamento ou capital de giro?";
  }

  const stock = data?.estoque || data?.stock || [];
  const suppliers = data?.fornecedores || data?.suppliers || [];
  const sales = data?.vendas || data?.sales || [];
  const financial = data?.lancamentosFinanceiros || [];
  const capitalPlan = data?.capitalDeGiro?.planoDeAcao || [];
  const workingCapitalGap = data?.capitalDeGiro?.gapProjetado || "não informado";
  const lowStockCount = Array.isArray(stock)
    ? stock.filter((row) => JSON.stringify(row).toLowerCase().includes("ruptura")).length
    : 0;
  const supplierRisk = Array.isArray(suppliers)
    ? suppliers.filter((row) => Number.parseInt(String(row?.[2] || row?.score || "100"), 10) < 85).length
    : 0;
  const pendingExpenses = Array.isArray(financial)
    ? financial.filter((row) => JSON.stringify(row).toLowerCase().includes("despesa") && JSON.stringify(row).toLowerCase().includes("pendente")).length
    : 0;

  return `O que eu percebi:
${lowStockCount > 0 ? `Existem ${lowStockCount} produto(s) com risco de ruptura no estoque.` : "O estoque não mostra ruptura crítica nos dados enviados."}
${pendingExpenses > 0 ? `Também existem ${pendingExpenses} despesa(s) pendente(s) no financeiro.` : "Não encontrei despesas pendentes críticas no financeiro enviado."}

Por que isso importa:
Quando estoque, fornecedores e financeiro são analisados juntos, fica mais fácil saber se o problema é venda, reposição, prazo de pagamento ou caixa. O gap de capital de giro informado foi ${workingCapitalGap}.

Risco:
${lowStockCount > 0 || supplierRisk > 0 || pendingExpenses > 0 ? "Alto, porque há sinais que podem afetar vendas, margem, reposição ou caixa." : "Médio, porque os dados pedem acompanhamento, mas não mostram crise imediata."}

Minha recomendação:
${supplierRisk > 0 ? "Comece abrindo cotação com fornecedores alternativos e compare prazo, preço e confiabilidade antes da próxima compra." : "Priorize os itens de maior giro e revise compras antes de assumir novos compromissos financeiros."}

Primeiro passo:
Revise hoje os produtos em ruptura, as despesas pendentes e o plano de capital de giro. Se houver pouco caixa, negocie prazo antes de comprar mais estoque.

Resumo:
Minha recomendação é usar os dados atuais para proteger caixa e estoque ao mesmo tempo. A IA está considerando os registros cadastrados no dashboard, não apenas dados fixos de demonstração.

Dados usados:
- Módulo: ${module}
- Pergunta: ${question || "Análise automática"}
- Itens de estoque: ${Array.isArray(stock) ? stock.length : 0}
- Fornecedores: ${Array.isArray(suppliers) ? suppliers.length : 0}
- Vendas: ${Array.isArray(sales) ? sales.length : 0}
- Lançamentos financeiros: ${Array.isArray(financial) ? financial.length : 0}
- Ações de capital de giro: ${Array.isArray(capitalPlan) ? capitalPlan.length : 0}
- Capital de giro: ${workingCapitalGap}`;
}

app.use((err, req, res, next) => {
  if (err?.message === "Origem não permitida pelo CORS.") {
    logSecurityEvent("cors_blocked", req, { origin: req.get("origin") || "sem_origin" });
    return res.status(403).json({
      success: false,
      message: "Origem não autorizada.",
    });
  }

  console.error("Erro inesperado:", err);
  return res.status(500).json({
    success: false,
    message: "Erro interno no servidor.",
  });
});

app.listen(PORT, () => {
  console.log("\n========================================");
  console.log("Servidor NexFinance rodando");
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || "development"}`);
  console.log(`Banco: ${supabase ? "Supabase" : "Demonstração local"}`);
  console.log("========================================\n");
});

