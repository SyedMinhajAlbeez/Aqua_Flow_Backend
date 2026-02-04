// src/routes/userRoutes.js
const express = require('express');
const { createCompanyUser } = require('../controllers/authController');
const { getUsers, updateCompany,getUsersStats,updateUserStatus } = require('../controllers/userController'); // YE CHANGE
const router = express.Router();

router.post('/create', createCompanyUser);
router.get('/all', getUsers);           // userController se
router.put('/update', updateCompany);

router.patch("/status/:id", updateUserStatus);
router.get('/getUsersStats', getUsersStats);// userController se

module.exports = router;