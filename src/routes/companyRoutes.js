// src/routes/companyRoutes.js
const express = require('express');
const { createCompany } = require('../controllers/authController');
const router = express.Router();

router.post('/create', createCompany);

module.exports = router;