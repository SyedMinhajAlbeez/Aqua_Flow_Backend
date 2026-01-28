// src/routes/companyRoutes.js
const express = require("express");

const { protect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const upload = require("../middleware/upload");
const { createCompany } = require("../controllers/authController");
const router = express.Router();

// {
//   "name": "Tech Innovations Pvt Ltd",
//   "email": "admin@techinnovations.com",
//   "password": "SecurePass123!",
//   "phone": "+91-9876543210",
//   "address": "123 Startup Hub, Bangalore, Karnataka 560001",
//   "logo": "https://example.com/logo.png"
// }

router.post("/create", protect, tenantMiddleware, upload, createCompany);

module.exports = router;
