// validators/authValidator.js
const { check } = require('express-validator');
const { validate } = require('./index');

exports.validateLogin = [
    check('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    check('password')
        .notEmpty()
        .withMessage('Password is required'),
    validate
];

exports.validateForgotPassword = [
    check('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    validate
];

exports.validateResetPassword = [
    check('token')
        .notEmpty()
        .withMessage('Token is required'),
    check('newPassword')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    check('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
    validate
];