const jwt = require("jsonwebtoken");

// Middleware para verificar token JWT
const verifyToken = (req, res, next) => {
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

    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET || "nexfinance_secret_key_dev");

    req.user = decoded;
    next();
  } catch (error) {
    console.error("Erro ao verificar token:", error);

    return res.status(401).json({
      success: false,
      message: "Token expirado ou inválido.",
    });
  }
};

module.exports = {
  verifyToken,
};
