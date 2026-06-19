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
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const JWT_SECRET_CONFIGURED = Boolean(process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET);
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
    if (!origin || TRUSTED_ORIGINS.has(origin) || isLocalhostOrigin(origin) || isVercelProjectOrigin(origin)) {
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
app.use("/api/auth/resend-verification", sensitiveRouteLimiter);

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

const { data: authData, error: insertError } =
  await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        company_name: company
      }
    }
  });

const newUser = [{
  id: authData?.user?.id,
  name,
  email,
  company_name: company
}];

    if (insertError || !newUser?.length) {
  console.error("ERRO INSERT USER:", insertError);

  return res.status(500).json({
    success: false,
    message: insertError?.message || "Erro ao cadastrar usuário.",
    error: insertError
  });
}

    const userData = newUser[0];

    const { data: companyData, error: companyError } = await supabase
  .from("companies")
  .insert([{
    razao_social: company,
    nome_fantasia: company,
    cnpj: cnpj || null,
    status: "active"
  }]);

console.log("COMPANY ERROR:", companyError);

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
      if (!isUserEmailVerified(existingDemoUser)) {
        pendingRegistrationsByEmail.set(email, existingDemoUser.emailVerificationToken || existingDemoUser.email_verification_token_hash);
        return res.status(200).json({
          success: true,
          requiresEmailVerification: true,
          message: "Esta conta já foi criada, mas ainda falta confirmar o email. Use o botão de reenvio para receber um novo link.",
        });
      }

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
        .select("id, email_verified")
        .eq("email", email)
        .maybeSingle();

      if (existingUser) {
        if (existingUser.email_verified === false) {
          return res.status(200).json({
            success: true,
            requiresEmailVerification: true,
            message: "Esta conta já foi criada, mas ainda falta confirmar o email. Use o botão de reenvio para receber um novo link.",
          });
        }

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

    try {
      await sendVerificationEmail({ to: email, name, verificationUrl });
    } catch (emailError) {
      console.error("Erro ao enviar email de validacao:", emailError);
      return res.status(202).json({
        success: true,
        requiresEmailVerification: true,
        emailDeliveryWarning: true,
        message: buildEmailDeliveryFailureMessage(emailError),
        devVerificationUrl: shouldExposeDevVerificationUrl() ? verificationUrl : undefined,
      });
    }

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

app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    let { email } = req.body;
    const validation = validateEmail(email);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Informe um email válido para reenviar a confirmação.",
        errors: validation.errors,
      });
    }

    email = sanitizeInput(email).toLowerCase();
    const verification = createEmailVerificationToken();
    const verificationUrl = `${getAppBaseUrl(req)}/api/auth/verify-email?token=${verification.token}`;
    const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRES_MS).toISOString();
    let name = "usuário";
    let shouldSend = false;

    if (!supabase) {
      const demoUser = demoUsers.find((user) => user.email === email);
      if (demoUser && !isUserEmailVerified(demoUser)) {
        demoUser.emailVerificationToken = verification.tokenHash;
        demoUser.email_verification_token_hash = verification.tokenHash;
        demoUser.emailVerificationExpires = verificationExpiresAt;
        demoUser.email_verification_expires_at = verificationExpiresAt;
        name = demoUser.full_name || demoUser.name || name;
        shouldSend = true;
      }
    } else {
      const { data: user, error: queryError } = await supabase
        .from("users")
        .select("id, name, email_verified")
        .eq("email", email)
        .maybeSingle();

      if (queryError) {
        return res.status(500).json({
          success: false,
          message: "Não foi possível consultar sua conta agora.",
        });
      }

      if (user && user.email_verified === false) {
        const { error: updateError } = await supabase
          .from("users")
          .update({
            email_verification_token_hash: verification.tokenHash,
            email_verification_expires_at: verificationExpiresAt,
          })
          .eq("id", user.id);

        if (updateError) {
          return res.status(500).json({
            success: false,
            message: "Não foi possível gerar um novo link de validação.",
          });
        }

        name = user.name || name;
        shouldSend = true;
      }
    }

    // Segurança: resposta genérica evita confirmar se um email está cadastrado.
    if (!shouldSend) {
      return res.status(200).json({
        success: true,
        message: "Se existir uma conta pendente para este email, enviaremos um novo link de validação.",
      });
    }

    pendingRegistrationsByEmail.set(email, verification.tokenHash);

    try {
      await sendVerificationEmail({ to: email, name, verificationUrl });
    } catch (emailError) {
      console.error("Erro ao reenviar email de validacao:", emailError);
      return res.status(502).json({
        success: false,
        message: buildEmailDeliveryFailureMessage(emailError),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Enviamos um novo link de validação. Confira a caixa de entrada e o spam.",
      devVerificationUrl: shouldExposeDevVerificationUrl() ? verificationUrl : undefined,
    });
  } catch (error) {
    console.error("Erro ao reenviar validacao de email:", error);
    return res.status(500).json({
      success: false,
      message: "Não conseguimos reenviar o email agora. Tente novamente em instantes.",
    });
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
      return res.status(500).json({
        success: false,
        message: "Erro na conexão com o banco.",
      });
    }

    const user = users?.[0];
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado.",
      });
    }

    // Segurança: bloqueia login de contas que ainda não validaram email.
    if (user.email_verified === false) {
      return res.status(403).json({
        success: false,
        message: "Confirme seu email antes de fazer login.",
      });
    }

    // Segurança: o cadastro do NexFinance grava senha com bcrypt em public.users.
    // Por isso o login valida o hash local, e não o Supabase Auth separado.
    if (!(await bcrypt.compare(password, user.password_hash))) {
      logSecurityEvent("login_failed", req, { email: maskEmail(email), mode: "supabase_table" });
      return res.status(401).json({
        success: false,
        message: "Email ou senha incorretos.",
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
  const clientId = process.env.GOOGLE_CLIENT_ID || "";

  // Para evitar falha silenciosa no front: se estiver vazio, devolvemos o endpoint com clientId vazio
  // mas também sinalizamos o motivo no payload.
  return res.status(200).json({
    success: true,
    clientId,
    configured: Boolean(clientId && !String(clientId).includes("cole_o_client_id")),
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

    if (!ensureJwtSecretConfigured(res)) return;

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

    if (!ensureJwtSecretConfigured(res)) return;

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

    return res.status(200).send(renderVerificationPage({
      title: "Senha atualizada",
      message: "Sua senha foi redefinida com sucesso. Agora você já pode entrar na NexFinance.",
      linkLabel: "Ir para o login",
      linkHref: "/login.html?reset=1",
    }));
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

// Fallback s                                                                                         ó para rotas /api que NÃO foram encontradas.
// Colocar isso no final do arquivo evita mascarar rotas existentes.
app.use("/api", (req, res) => {
  console.error("[API 404] Método/rota:", req.method, req.originalUrl);
  return res.status(404).json({
    success: false,
    message: "Rota de API não encontrada.",
    requested: {
      method: req.method,
      path: req.originalUrl,
    },
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
    "https://se-liga-jovem2026.vercel.app",
    "https://se-ligajovem2026.vercel.app",
    "https://d-cio-dacio-soares-projects.vercel.app",
    "https://d-cio-daciosoares009-afk-dacio-soares-projects.vercel.app",
    "https://d-cio-git-main-dacio-soares-projects.vercel.app",
    "https://d-o4k1xgv9r-dacio-soares-projects.vercel.app",
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

function isVercelProjectOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:" || !hostname.endsWith(".vercel.app")) return false;

    return (
      hostname === "se-liga-jovem2026.vercel.app" ||
      hostname === "se-ligajovem2026.vercel.app" ||
      hostname === "d-cio-dacio-soares-projects.vercel.app" ||
      hostname === "d-cio-daciosoares009-afk-dacio-soares-projects.vercel.app" ||
      hostname === "d-cio-git-main-dacio-soares-projects.vercel.app" ||
      /^d-cio(?:-[a-z0-9-]+)?-dacio-soares-projects\.vercel\.app$/.test(hostname) ||
      /^d-[a-z0-9]+-dacio-soares-projects\.vercel\.app$/.test(hostname)
    );
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

function buildEmailDeliveryFailureMessage(error) {
  const details = String(error?.message || error || "");

  if (details.includes("You can only send testing emails")) {
    return "O provedor de email está em modo teste e só envia para o email dono da conta Resend. Para liberar outros emails, verifique um domínio no Resend e atualize o EMAIL_FROM.";
  }

  if (details.includes("RESEND_API_KEY") || details.includes("EMAIL_PROVIDER_API_KEY")) {
    return "O envio de email ainda não está configurado no servidor. Configure RESEND_API_KEY e EMAIL_FROM.";
  }

  return "Sua conta foi criada, mas não conseguimos enviar o email de validação agora. Tente reenviar em instantes.";
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

  if (!ensureJwtSecretConfigured(res)) return;

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
  if (!ensureJwtSecretConfigured(res)) return;

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
    console.error("JWT_SECRET ou SUPABASE_JWT_SECRET precisa estar configurado em produção.");
    return "nexfinance_missing_jwt_secret_configure_vercel_env";
  }

  console.warn("JWT_SECRET não configurado. Usando segredo temporário apenas para desenvolvimento local.");
  return crypto.randomBytes(48).toString("hex");
}

function ensureJwtSecretConfigured(res) {
  if (JWT_SECRET_CONFIGURED || process.env.NODE_ENV !== "production") return true;

  return res.status(500).json({
    success: false,
    message: "Configuração de autenticação ausente no servidor.",
  });
}

function demoDashboard() {
  return {
    receitaTotal: 0,
    despesasTotais: 0,
    lucroLiquido: 0,
    scoreFinanceiro: 0,
    hasBusinessData: false,
    message: "Cadastre vendas, estoque, fornecedores e lançamentos financeiros para ativar os indicadores.",
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
Voce e a IA consultora financeira da NexFinance, chamada Nexy.

A NexFinance ajuda pequenos comerciantes, MEIs, prestadores de servico e donos de pequenos negocios a organizar financas, vendas, estoque, clientes, fornecedores e planejamento mensal.

Sua funcao:
- agir como consultor financeiro simples, pratico e inteligente;
- transformar dados simples em diagnosticos claros, alertas, recomendacoes, agenda de tarefas e planejamento do proximo mes;
- explicar o significado dos numeros e sempre converter analise em acao pratica;
- falar como alguem que entende a realidade de padarias, mercadinhos, lanchonetes, saloes, barbearias, lojas, restaurantes pequenos, autonomos e empreendedores locais.

Tom obrigatorio:
- humano, simples, direto, educado, profissional, pratico e realista;
- sem linguagem dificil;
- se usar termo financeiro, explique em linguagem comum;
- nao responda como robo tecnico;
- nao prometa lucro garantido.

Regra principal:
Analise somente os dados fornecidos. Nao invente valores, vendas, despesas, lucro, impostos, prazos ou previsoes. Se faltar informacao, diga exatamente o que falta e peca apenas o essencial.

Dados que voce pode receber:
- negocio: nome, tipo, cidade, tempo, dificuldade, objetivo, funcionarios, forma de controle, separacao entre dinheiro pessoal e empresa;
- financeiro: vendas, despesas, contas a pagar, contas a receber, contas atrasadas, caixa, lucro, retirada do dono, reserva, dividas e investimentos;
- estoque: produto, quantidade, estoque minimo, custo, preco, produtos mais vendidos, parados, perto de acabar, margem e validade;
- clientes: recorrencia, ticket medio, inadimplencia, frequencia e clientes que pararam de comprar;
- fornecedores: produto, preco, prazo, atraso, condicao de pagamento e possibilidade de negociacao;
- metas: vendas, lucro, economia, crescimento, reserva e organizacao.

Checklist de analise:
1. O negocio esta vendendo bem?
2. As despesas estao altas?
3. O lucro esta saudavel?
4. Existe risco de faltar dinheiro?
5. Existem contas atrasadas?
6. O estoque esta bem controlado?
7. Produto importante esta acabando?
8. Produto parado precisa de promocao?
9. O negocio perde vendas por falta de produto?
10. Fornecedores ajudam ou prejudicam?
11. Ha chance de aumentar vendas?
12. Ha chance de reduzir gastos?
13. O proximo mes esta planejado?
14. Existe reserva financeira?
15. O dono mistura dinheiro pessoal com dinheiro da empresa?

Regras de alerta financeiro:
- despesas maiores que vendas: risco grave;
- despesas acima de 70% das vendas: atencao com lucro;
- contas atrasadas: priorizar pagamento ou negociacao;
- caixa baixo: risco de faltar dinheiro;
- sem reserva: recomendar criar reserva;
- muitas retiradas pessoais: alertar mistura de dinheiro;
- vende bem mas sobra pouco: revisar despesas, estoque, recebiveis e retiradas.

Regras de alerta de estoque:
- estoque atual abaixo do minimo: recomendar reposicao;
- produto muito vendido com estoque baixo: risco de perder vendas;
- produto parado: sugerir promocao, combo ou reduzir compra;
- alto custo e baixa venda: reavaliar;
- boa margem e boa saida: destacar nas vendas;
- vencimento: controlar validade.

Regras de clientes e fornecedores:
- clientes compraram uma vez: sugerir fidelizacao;
- clientes antigos pararam: sugerir contato ou promocao;
- inadimplencia: sugerir cobranca organizada e educada;
- fornecedor atrasa ou encarece: sugerir negociacao e fornecedor alternativo;
- prazo de pagamento curto: sugerir renegociacao.

Modo conversa:
Use para saudacoes, duvidas simples ou usuario confuso. Seja curto, natural e acolhedor. Nao use muitos titulos.

Modo analise:
Use quando houver dados, numeros, valores, prazos, indicadores, pedido de diagnostico, plano, relatorio, decisao ou planejamento.
Nesses casos, responda sempre neste formato:

DIAGNOSTICO GERAL:
Explique a situacao geral em linguagem simples.

PONTOS POSITIVOS:
Mostre o que esta indo bem. Se nao houver dados suficientes, diga isso.

PROBLEMAS IDENTIFICADOS:
Liste os principais problemas encontrados.

ALERTAS IMPORTANTES:
Mostre os riscos mais urgentes.

IMPACTO NO NEGOCIO:
Explique como afeta caixa, lucro, vendas, estoque ou organizacao.

ACOES RECOMENDADAS:
Liste acoes simples, possiveis e diretas.

AGENDA DE TAREFAS:
Organize por semana ou prioridade. Cada tarefa deve ter periodo, tarefa, prioridade, objetivo e resultado esperado.

PROJETO FINANCEIRO PARA O PROXIMO MES:
Inclua meta de vendas, limite de despesas, previsao simples de lucro quando houver dados, contas prioritarias, produtos para comprar, produtos para promocao, reserva recomendada e cuidados.

PROXIMO PASSO:
Diga a primeira acao mais importante.

Quando o usuario perguntar "Como esta meu negocio?", entregue diagnostico, pontos positivos, atencoes, riscos e proximo passo.
Quando perguntar "O que devo fazer no proximo mes?", entregue projeto financeiro, agenda semanal e prioridades.
Quando perguntar "Estou lucrando bem?", analise vendas, despesas, lucro, margem aproximada e melhorias.
Quando perguntar "Quais produtos devo comprar?", analise estoque atual, minimo, giro e fornecedores.
Quando perguntar "Como vender mais?", sugira promocoes simples, combos, WhatsApp/Instagram, fidelizacao, destaque de produtos e reativacao de clientes.
Quando perguntar "Como evitar faltar dinheiro?", sugira registrar entradas/saidas, separar dinheiro pessoal, priorizar contas, criar reserva e acompanhar caixa semanalmente.

Limites:
- Nao de aconselhamento juridico, contabil, tributario, credito ou investimento como se fosse profissional autorizado.
- Para imposto, contrato, emprestimo, divida grande ou decisao contabil, oriente procurar contador, banco ou profissional especializado.
- Seja educativo e conservador.

${json ? `Quando o sistema pedir recomendacoes estruturadas, inclua um bloco JSON valido com este formato:
{
  "diagnostico_geral": "...",
  "pontos_positivos": ["..."],
  "problemas_identificados": ["..."],
  "alertas_importantes": ["..."],
  "impacto_no_negocio": "...",
  "acoes_recomendadas": ["..."],
  "agenda_de_tarefas": [{"periodo":"Semana 1","tarefa":"...","prioridade":"Alta | Media | Baixa","objetivo":"...","resultado_esperado":"..."}],
  "projeto_financeiro_proximo_mes": {"meta_vendas":"...","limite_despesas":"...","previsao_lucro":"...","reserva_financeira":"...","prioridades":["..."]},
  "proximo_passo": "...",
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

  return `DIAGNOSTICO GERAL:
Pelos dados atuais, o ponto principal e acompanhar caixa, estoque, fornecedores e vendas juntos. ${lowStockCount > 0 ? `Existem ${lowStockCount} produto(s) com risco de falta no estoque.` : "O estoque nao mostra ruptura critica nos dados enviados."} ${pendingExpenses > 0 ? `Tambem existem ${pendingExpenses} despesa(s) pendente(s) no financeiro.` : "Nao encontrei despesas pendentes criticas no financeiro enviado."}

PONTOS POSITIVOS:
- Ja existem dados suficientes para comecar uma leitura operacional.
- O sistema consegue cruzar estoque, financeiro, fornecedores e vendas para orientar decisoes.

PROBLEMAS IDENTIFICADOS:
${lowStockCount > 0 ? "- Produto abaixo do minimo pode causar perda de vendas." : "- Ainda faltam mais detalhes de giro de produtos para prever compras com seguranca."}
${supplierRisk > 0 ? "- Ha fornecedor com sinal de risco ou baixa confiabilidade." : "- Os fornecedores precisam ser acompanhados por preco, prazo e confiabilidade."}
${pendingExpenses > 0 ? "- Existem despesas pendentes que podem pressionar o caixa." : "- As contas a pagar devem continuar sendo registradas para evitar surpresa no caixa."}

ALERTAS IMPORTANTES:
- Se faltar produto de boa saida, o negocio pode perder vendas.
- Se comprar estoque sem olhar caixa e contas a pagar, pode faltar dinheiro para compromissos proximos.
- O gap de capital de giro informado foi ${workingCapitalGap}.

IMPACTO NO NEGOCIO:
Esses pontos afetam diretamente vendas, caixa e organizacao. O dono pode vender menos por falta de produto ou apertar o caixa comprando sem planejamento.

ACOES RECOMENDADAS:
${supplierRisk > 0 ? "- Abrir cotacao com fornecedores alternativos e comparar preco, prazo e confiabilidade." : "- Priorizar os produtos de maior giro antes de comprar itens menos importantes."}
- Registrar todas as contas a pagar e a receber.
- Revisar produtos abaixo do estoque minimo.
- Separar dinheiro pessoal do dinheiro da empresa.

AGENDA DE TAREFAS:
Semana 1:
- Tarefa: Conferir produtos mais vendidos e itens abaixo do minimo.
- Prioridade: Alta.
- Objetivo: Evitar perda de vendas.
- Resultado esperado: Saber o que precisa ser comprado primeiro.

Semana 2:
- Tarefa: Comparar fornecedores e prazos de pagamento.
- Prioridade: Media.
- Objetivo: Comprar melhor e proteger o caixa.
- Resultado esperado: Reduzir risco de atraso ou compra cara.

Semana 3:
- Tarefa: Revisar despesas pendentes e contas futuras.
- Prioridade: Alta.
- Objetivo: Evitar falta de dinheiro.
- Resultado esperado: Caixa mais previsivel.

Semana 4:
- Tarefa: Fechar vendas, despesas e lucro estimado do mes.
- Prioridade: Alta.
- Objetivo: Planejar o proximo mes com dados reais.
- Resultado esperado: Metas mais claras.

PROJETO FINANCEIRO PARA O PROXIMO MES:
- Meta de vendas: definir uma meta realista apos registrar as vendas atuais.
- Limite de despesas: tentar manter despesas abaixo de 70% das vendas.
- Reserva financeira: separar uma parte pequena do lucro para emergencias.
- Produtos prioritarios: comprar primeiro os produtos mais vendidos e abaixo do minimo.
- Produtos para promocao: avaliar itens parados ou com estoque alto.

PROXIMO PASSO:
Comece hoje revisando estoque critico e contas pendentes. Essa e a acao mais simples para evitar perda de vendas e proteger o caixa.

Dados usados:
- Modulo: ${module}
- Pergunta: ${question || "Analise automatica"}
- Itens de estoque: ${Array.isArray(stock) ? stock.length : 0}
- Fornecedores: ${Array.isArray(suppliers) ? suppliers.length : 0}
- Vendas: ${Array.isArray(sales) ? sales.length : 0}
- Lancamentos financeiros: ${Array.isArray(financial) ? financial.length : 0}
- Acoes de capital de giro: ${Array.isArray(capitalPlan) ? capitalPlan.length : 0}`;
}

// Alimentacao final da IA: esta declaracao fica por ultimo e sobrescreve versoes antigas.
function buildNexFinancePrompt({ module, question, data, json = false }) {
  return `
Voce e a IA da NexFinance, uma assistente financeira criada para ajudar pequenos comerciantes, MEIs, microempreendedores, prestadores de servico e empreendedores locais.

Sua principal funcao nao e apenas responder rapido. Antes de analisar, voce deve entender a situacao do cliente.
Converse de forma simples, humana, educada e pratica, como um consultor financeiro explicando para uma pessoa que pode ter pouca experiencia com tecnologia ou financas.

Regras principais:
- Nunca comece com resposta tecnica demais.
- Nunca responda de forma fria, seca ou robotica.
- Nunca entregue so numeros.
- Sempre tente entender o contexto do cliente antes de dar uma conclusao.
- Nunca invente valores, vendas, despesas, lucro, impostos, prazos ou previsoes.
- Se faltar informacao, diga exatamente o que falta e peca somente o essencial.
- Nunca culpe o cliente pela desorganizacao.
- Nunca use tom de julgamento.
- Nunca diga apenas "procure controlar melhor"; diga o primeiro passo concreto.
- Use dados agregados recebidos do sistema e nao exponha dados sensiveis.

Escolha mentalmente um modo antes de responder. Nao diga ao usuario qual modo esta usando.

MODOS DE ATENDIMENTO:

1. MODO ACOLHIMENTO
Use quando o usuario cumprimentar, pedir ajuda generica, parecer confuso, nao souber por onde comecar ou disser que o negocio esta desorganizado.
Responda com acolhimento, poucas perguntas e sem analise completa.
Pergunte:
1. Qual e o tipo do seu negocio?
2. Quanto vendeu mais ou menos neste mes?
3. Quais sao as principais despesas?
4. Tem alguma conta atrasada?
5. A maior dificuldade hoje e dinheiro, estoque, vendas ou organizacao?

2. MODO ENTENDIMENTO DO PROBLEMA
Use quando houver uma dificuldade sem dados suficientes, como "vendo, mas nao sobra dinheiro", "estoque acaba rapido" ou "tenho muita conta".
Mostre que entendeu, explique possibilidades simples e faca perguntas especificas. Nao conclua sem dados.

3. MODO ANALISE FINANCEIRA
Use quando houver vendas, despesas, lucro ou contas a pagar/atrasadas.
Formato obrigatorio:
DIAGNOSTICO SIMPLES:
O QUE ESTA BOM:
PONTOS DE ATENCAO:
O QUE ISSO SIGNIFICA:
O QUE FAZER AGORA:
PROXIMO PASSO:

4. MODO ESTOQUE
Use quando falar de produtos acabando, estoque baixo, produtos parados, compras, mais vendidos ou perda de vendas por falta de produto.
Formato:
SITUACAO DO ESTOQUE:
PRODUTOS PRIORITARIOS:
RISCO:
ACAO RECOMENDADA:
PROXIMO PASSO:
Regras: produto muito vendido com pouco estoque e prioridade alta; produto parado pede promocao, combo ou reduzir compra; abaixo do minimo pede reposicao.

5. MODO CLIENTES
Use para clientes, fidelizacao, clientes que sumiram, inadimplencia, vender mais, atendimento ou cadastro.
Formato:
SITUACAO DOS CLIENTES:
OPORTUNIDADES:
ACOES SIMPLES:
PROXIMO PASSO:

6. MODO FORNECEDORES
Use para fornecedor, compra, preco, prazo, atraso ou negociacao.
Formato:
SITUACAO DOS FORNECEDORES:
IMPACTO NO NEGOCIO:
ACAO RECOMENDADA:
PROXIMO PASSO:
Explique como fornecedor afeta caixa, estoque e vendas. Sugira comparar preco, prazo e confiabilidade.

7. MODO AGENDA E ORGANIZACAO
Use quando pedir agenda, tarefas, rotina, organizacao ou o que fazer na semana.
Formato:
AGENDA DE ORGANIZACAO:
HOJE:
ESTA SEMANA:
ESTE MES:
Faca uma agenda curta, possivel e priorize o que evita perda de dinheiro, perda de venda ou desorganizacao.

8. MODO PLANEJAMENTO DO MES SEGUINTE
Use para planejamento do proximo mes, meta, previsao ou organizacao mensal.
Formato:
PLANEJAMENTO DO PROXIMO MES:
1. META DE VENDAS:
2. LIMITE DE DESPESAS:
3. CONTAS PRIORITARIAS:
4. ESTOQUE:
5. RESERVA FINANCEIRA:
6. ACOES PARA VENDER MAIS:
7. AGENDA DO MES:
8. PRIMEIRO PASSO:
Se nao houver dados suficientes, explique isso e monte um plano inicial de organizacao.

9. MODO EXPLICACAO SIMPLES
Use quando perguntar conceitos como lucro, fluxo de caixa, despesa fixa, separar dinheiro pessoal, controlar estoque ou calcular algo.
Formato:
EXPLICACAO SIMPLES:
EXEMPLO:
COMO USAR NO SEU NEGOCIO:
Use exemplo de comercio local e evite termos dificeis.

10. MODO DADOS INSUFICIENTES
Use quando o usuario pedir analise sem informacoes suficientes.
Nao invente resposta. Peca somente os dados necessarios:
1. Vendas do mes.
2. Despesas do mes.
3. Contas a pagar.
4. Contas atrasadas.
5. Produtos que mais vendem.
6. Produtos que estao acabando.
7. Maior dificuldade atual.

Linguagem obrigatoria:
- Prefira "dinheiro que entrou" em vez de "receita bruta".
- Prefira "dinheiro que saiu" em vez de "despesas operacionais".
- Prefira "sobrou pouco dinheiro" em vez de "baixa margem operacional".
- Prefira "produto parado" em vez de "estoque sem giro".
- Prefira "contas atrasadas" em vez de "obrigacoes vencidas".
- Prefira "guardar uma parte do lucro" em vez de "constituir reserva de capital".

Regras de decisao:
- Saudacao ou pedido generico: modo acolhimento.
- Problema sem dados: modo entendimento do problema.
- Vendas, despesas, lucro ou contas: modo analise financeira.
- Produtos, compras ou estoque: modo estoque.
- Clientes ou vendas: modo clientes.
- Fornecedores: modo fornecedores.
- Rotina, tarefas ou agenda: modo agenda.
- Mes seguinte, meta ou projeto financeiro: modo planejamento.
- Conceito ou explicacao: modo explicacao simples.
- Analise sem informacao suficiente: modo dados insuficientes.

Se o sistema pedir recomendacoes estruturadas, responda em JSON valido quando json=true.
${json ? `Formato JSON obrigatorio:
[
  {
    "prioridade": "Baixa | Media | Alta | Critica",
    "problema": "Problema ou oportunidade identificada",
    "impacto": "Impacto simples no negocio",
    "risco": "Baixo | Medio | Alto",
    "acao_recomendada": "Acao pratica",
    "proximo_passo": "Primeira acao"
  }
]` : ""}

Modulo atual: ${module}
Mensagem do usuario: ${question}

Dados reais e agregados recebidos:
${JSON.stringify(data, null, 2)}

Regra final:
Primeiro entenda, depois oriente. A resposta deve fazer o comerciante pensar: "Agora eu entendi o que esta acontecendo e sei qual e o proximo passo."
`;
}

// Fallback local quando a IA externa nao responde. Mantem o mesmo comportamento consultivo.
function buildDemoAiAnswer(module, data, question) {
  const message = String(question || "").trim();
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = normalized.split(/\s+/).filter(Boolean);
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

  const isGreeting = /^(oi|ola|bom dia|boa tarde|boa noite|e ai|eai|hey|hello|hi)$/.test(normalized);
  const isConfused = /(me ajuda|nao sei|estou perdido|to perdido|o que faco|bagunca|desorganizado)/.test(normalized);
  const asksStock = /(estoque|produto|produtos|comprar|mercadoria|ruptura|acabando|parado)/.test(normalized);
  const asksSuppliers = /(fornecedor|fornecedores|cotacao|preco de compra|prazo|atraso|negociar)/.test(normalized);
  const asksCustomers = /(cliente|clientes|fidelizar|inadimplencia|vender mais|atendimento)/.test(normalized);
  const asksAgenda = /(agenda|tarefas|rotina|organizar|semana|o que fazer)/.test(normalized);
  const asksNextMonth = /(proximo mes|mes seguinte|planejamento|meta|previsao)/.test(normalized);
  const asksConcept = /(o que e|como calcular|fluxo de caixa|lucro|despesa fixa|separar dinheiro)/.test(normalized);
  const asksFinance = /(financeiro|caixa|vendas|despesas|contas|lucro|dinheiro|relatorio|diagnostico|analise)/.test(normalized);

  if (!hasBusinessData && (isGreeting || isConfused || (!hasNumbers && words.length < 5))) {
    return `Ola! Eu posso te ajudar a organizar melhor o seu negocio.

Para comecar, me diga so algumas coisas:

1. Qual e o tipo do seu negocio?
2. Quanto voce vendeu mais ou menos neste mes?
3. Quais sao suas principais despesas?
4. Voce tem alguma conta atrasada?
5. Sua maior dificuldade hoje e dinheiro, estoque, vendas ou organizacao?

Com essas respostas, eu consigo te orientar melhor.`;
  }

  if (!hasBusinessData && !hasNumbers && (asksFinance || asksStock || asksSuppliers || asksCustomers)) {
    return `Consigo te ajudar com isso, mas preciso de algumas informacoes para nao fazer uma analise errada.

Me envie, mesmo que seja aproximado:

1. Vendas do mes.
2. Despesas do mes.
3. Contas a pagar.
4. Contas atrasadas.
5. Produtos que mais vendem.
6. Produtos que estao acabando.
7. Maior dificuldade atual.

Com esses dados, eu consigo montar uma analise, uma agenda e um planejamento para o proximo mes.`;
  }

  if (asksConcept) {
    return `EXPLICACAO SIMPLES:
Fluxo de caixa e o controle do dinheiro que entra e sai do negocio. Ele mostra se vai sobrar dinheiro para pagar contas, comprar mercadoria e guardar reserva.

EXEMPLO:
Se hoje entraram R$ 500,00 em vendas e sairam R$ 300,00 em despesas, sobraram R$ 200,00 no caixa.

COMO USAR NO SEU NEGOCIO:
Anote todo dia o dinheiro que entrou, o dinheiro que saiu e o que ainda falta pagar. Assim voce evita surpresa no fim do mes.`;
  }

  if (asksAgenda) {
    return `AGENDA DE ORGANIZACAO:

HOJE:
- Conferir dinheiro que entrou e saiu.
- Prioridade: Alta.
- Objetivo: entender o caixa real.

ESTA SEMANA:
- Revisar produtos que estao acabando e contas a pagar.
- Prioridade: Alta.
- Objetivo: evitar perda de vendas e atraso de contas.

ESTE MES:
- Fechar vendas, despesas e lucro estimado.
- Prioridade: Media.
- Objetivo: planejar o proximo mes com mais seguranca.`;
  }

  if (asksNextMonth) {
    return `PLANEJAMENTO DO PROXIMO MES:

1. META DE VENDAS:
Defina uma meta realista com base nas vendas atuais.

2. LIMITE DE DESPESAS:
Tente manter os gastos abaixo de 70% do dinheiro que entrou.

3. CONTAS PRIORITARIAS:
Pague primeiro contas atrasadas, fornecedores essenciais e despesas que podem gerar juros.

4. ESTOQUE:
Compre primeiro produtos que mais vendem e estao perto de acabar.

5. RESERVA FINANCEIRA:
Guarde uma pequena parte do lucro, mesmo que seja pouco.

6. ACOES PARA VENDER MAIS:
Faça combos, reative clientes antigos e divulgue produtos de maior saida.

7. AGENDA DO MES:
Semana 1: organizar caixa.
Semana 2: revisar estoque.
Semana 3: negociar fornecedores.
Semana 4: fechar resultado.

8. PRIMEIRO PASSO:
Comece conferindo quanto entrou e quanto saiu nos ultimos 7 dias.`;
  }

  const stock = data?.estoque || data?.stock || [];
  const suppliers = data?.fornecedores || data?.suppliers || [];
  const sales = data?.vendas || data?.sales || [];
  const financial = data?.lancamentosFinanceiros || [];
  const lowStockCount = Array.isArray(stock)
    ? stock.filter((row) => JSON.stringify(row).toLowerCase().includes("ruptura")).length
    : 0;
  const supplierRisk = Array.isArray(suppliers)
    ? suppliers.filter((row) => Number.parseInt(String(row?.[2] || row?.score || "100"), 10) < 85).length
    : 0;
  const pendingExpenses = Array.isArray(financial)
    ? financial.filter((row) => JSON.stringify(row).toLowerCase().includes("despesa") && JSON.stringify(row).toLowerCase().includes("pendente")).length
    : 0;

  if (asksStock) {
    return `SITUACAO DO ESTOQUE:
Pelos dados atuais, ${lowStockCount > 0 ? `existem ${lowStockCount} produto(s) com risco de faltar.` : "nao encontrei ruptura critica, mas o estoque precisa continuar sendo acompanhado."}

PRODUTOS PRIORITARIOS:
Priorize produtos que vendem mais e estao abaixo do estoque minimo.

RISCO:
Se um produto de boa saida acabar, voce pode perder vendas mesmo tendo cliente querendo comprar.

ACAO RECOMENDADA:
Reponha primeiro os produtos mais vendidos, evite comprar produto parado e compare fornecedores antes da compra.

PROXIMO PASSO:
Confira hoje quais produtos estao abaixo do minimo e qual fornecedor entrega mais rapido.`;
  }

  if (asksSuppliers) {
    return `SITUACAO DOS FORNECEDORES:
${supplierRisk > 0 ? `Ha ${supplierRisk} fornecedor(es) com sinal de risco ou baixa confiabilidade.` : "Os fornecedores precisam ser comparados por preco, prazo e confiabilidade."}

IMPACTO NO NEGOCIO:
Fornecedor caro, atrasado ou com prazo ruim pode apertar o caixa e causar falta de produto.

ACAO RECOMENDADA:
Abra cotacao com pelo menos dois fornecedores alternativos e compare preco, prazo de entrega e condicao de pagamento.

PROXIMO PASSO:
Escolha um produto importante e peca cotacao hoje antes da proxima compra.`;
  }

  if (asksCustomers) {
    return `SITUACAO DOS CLIENTES:
Clientes precisam ser acompanhados por frequencia, valor comprado e tempo sem comprar.

OPORTUNIDADES:
Voce pode vender mais reativando clientes antigos, oferecendo combos e mantendo contato pelo WhatsApp.

ACOES SIMPLES:
- Chamar clientes que compraram antes e sumiram.
- Oferecer uma novidade ou promocao simples.
- Anotar quem compra sempre e quem esta inadimplente.

PROXIMO PASSO:
Separe hoje 5 clientes antigos e mande uma mensagem educada oferecendo uma novidade.`;
  }

  return `DIAGNOSTICO SIMPLES:
Pelos dados atuais, o negocio precisa acompanhar dinheiro que entrou, dinheiro que saiu, estoque, fornecedores e vendas juntos. ${lowStockCount > 0 ? `Existem ${lowStockCount} produto(s) com risco de falta.` : "Nao encontrei falta critica de estoque nos dados enviados."} ${pendingExpenses > 0 ? `Tambem existem ${pendingExpenses} despesa(s) pendente(s).` : "As contas precisam continuar sendo registradas para evitar surpresa."}

O QUE ESTA BOM:
- Ja existem dados para comecar uma leitura do negocio.
- Voce consegue cruzar vendas, estoque, financeiro e fornecedores.

PONTOS DE ATENCAO:
${lowStockCount > 0 ? "- Produto abaixo do minimo pode causar perda de vendas." : "- Ainda e importante acompanhar produtos que mais vendem."}
${supplierRisk > 0 ? "- Existem fornecedores que merecem comparacao antes da compra." : "- Fornecedores devem ser avaliados por preco, prazo e confiabilidade."}
${pendingExpenses > 0 ? "- Contas pendentes podem apertar o caixa." : "- Continue registrando contas a pagar e receber."}

O QUE ISSO SIGNIFICA:
Se o estoque e o caixa nao forem acompanhados juntos, a empresa pode vender menos por falta de produto ou comprar demais e ficar sem dinheiro para pagar contas.

O QUE FAZER AGORA:
1. Conferir produtos abaixo do minimo.
2. Revisar contas pendentes.
3. Comparar fornecedores antes da proxima compra.
4. Separar dinheiro da empresa do dinheiro pessoal.

PROXIMO PASSO:
Comece hoje pelo estoque critico e pelas contas pendentes. Essa e a acao mais simples para evitar perda de vendas e proteger o caixa.

Dados usados:
- Modulo: ${module}
- Pergunta: ${question || "Analise automatica"}
- Itens de estoque: ${Array.isArray(stock) ? stock.length : 0}
- Fornecedores: ${Array.isArray(suppliers) ? suppliers.length : 0}
- Vendas: ${Array.isArray(sales) ? sales.length : 0}
- Lancamentos financeiros: ${Array.isArray(financial) ? financial.length : 0}`;
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("\n========================================");
    console.log("Servidor NexFinance rodando");
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || "development"}`);
    console.log(`Banco: ${supabase ? "Supabase" : "Demonstração local"}`);
    console.log("========================================\n");
  });
}

module.exports = app;

