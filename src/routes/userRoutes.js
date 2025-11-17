// src/routes/userRoutes.js
const express = require('express');
const { createCompanyUser } = require('../controllers/authController');
const { getUsers, updateCompany } = require('../controllers/userController'); // YE CHANGE
const router = express.Router();

router.post('/create', createCompanyUser);
router.get('/all', getUsers);           // userController se
router.put('/update', updateCompany);   // userController se

module.exports = router;