// src/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const prisma = require("../prisma/client");

module.exports.protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let authUser;

    if (decoded.role === "customer") {
      authUser = await prisma.customer.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          tenantId: true,
        },
      });
      if (authUser) req.customer = authUser;
    } else {
      authUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          tenantId: true,
        },
      });
      if (authUser) req.user = authUser;
    }

    if (!authUser) {
      return res.status(401).json({ message: "Invalid user" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Token expired or invalid" });
  }
};
