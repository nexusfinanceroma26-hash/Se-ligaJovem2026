const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;
const AUTH_COOKIE_NAME = "nexfinance_auth";

function readCookie(req, name) {
  const rawCookie = req.headers.cookie || "";
  const cookie = rawCookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) return "";
  return decodeURIComponent(cookie.split("=").slice(1).join("="));
}

function verifyToken(req, res, next) {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "JWT_SECRET não configurado no servidor.",
      });
    }

    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : "";
    const cookieToken = readCookie(req, AUTH_COOKIE_NAME);
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token não enviado.",
      });
    }

    // Segurança: valida assinatura e expiração do JWT no servidor antes de liberar rota privada.
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    console.error("Erro ao verificar token:", error.message);

    return res.status(401).json({
      success: false,
      message: "Token expirado ou inválido.",
    });
  }
}

module.exports = {
  verifyToken,
};
