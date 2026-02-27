const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Admin Login
router.post('/admin/login', authController.adminLogin);

// Resident Login (OTP)
router.post('/login/request-otp', authController.requestOTP);
router.post('/login/verify-otp', authController.verifyOTP);

module.exports = router;
