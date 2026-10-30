const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per windowMs
    message: { success: false, message: 'Too many login attempts, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // Limit each IP to 10 OTP verify attempts per windowMs
    message: { success: false, message: 'Too many OTP verification attempts, please try again after 10 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Trop de demandes de code. Réessayez dans 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Admin Login
router.post('/admin/login', loginLimiter, authController.adminLogin);

// Resident Login (OTP)
router.post('/login/request-otp', otpRequestLimiter, authController.requestOTP);
router.post('/login/verify-otp', otpVerifyLimiter, authController.verifyOTP);

module.exports = router;
