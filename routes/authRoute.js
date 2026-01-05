// routes/authRoute.js
const express = require('express');
const router = express.Router();
const svc = require('../services/authService');
//const { validateLogin, validateForgotPassword, validateResetPassword } = require('../validators/authValidators');

router.post('/login',  svc.login);
router.post('/forgot-password', svc.forgotPassword);
router.post('/reset-password', svc.resetPassword);

module.exports = router;