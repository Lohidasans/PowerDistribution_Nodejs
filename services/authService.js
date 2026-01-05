// services/authService.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { models, sequelize } = require('../models');
const { Op } = require('sequelize');
const commonService = require('./commonService');
const enMessage = require('../constants/en.json');
const { JWT_SECRET, JWT_EXPIRES_IN } = process.env;

const login = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return commonService.badRequest(res, enMessage.auth.emailPasswordRequired);
        }

        // Try to find user in both superadmin and user tables
        const [superadmin, user] = await Promise.all([
            models.SuperAdminProfile.findOne({
                where: { email, is_active: true, deleted_at: null },
                transaction: t
            }),
            models.User.findOne({
                where: { email, is_active: true, deleted_at: null },
                transaction: t
            })
        ]);

        const account = superadmin || user;

        if (!account) {
            await t.rollback();
            return commonService.unauthorized(res, enMessage.auth.invalidCredentials);
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, account.password);
        if (!isPasswordValid) {
            await t.rollback();
            return commonService.unauthorized(res, enMessage.auth.invalidCredentials);
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: account.id,
                email: account.email,
                role: superadmin ? 'superadmin' : 'user',
                // Add any other relevant user data
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN || '24h' }
        );

        // Update last login
        const updateField = superadmin ? 'last_login' : 'last_login_at';
        await account.update({ [updateField]: new Date() }, { transaction: t });

        await t.commit();

        // Return user data without password
        const { password: _, ...userData } = account.get({ plain: true });

        return commonService.okResponse(res, {
            message: enMessage.auth.loginSuccess,
            token,
            user: {
                ...userData,
                role: superadmin ? 'superadmin' : 'user'
            }
        });

    } catch (error) {
        await t.rollback();
        console.error('Login error:', error);
        return commonService.handleError(res, error);
    }
};

const forgotPassword = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { email } = req.body;

        if (!email) {
            return commonService.badRequest(res, enMessage.auth.emailRequired);
        }

        // Check in both superadmin and user tables
        const [superadmin, user] = await Promise.all([
            models.SuperAdminProfile.findOne({
                where: { email, is_active: true, deleted_at: null },
                transaction: t
            }),
            models.User.findOne({
                where: { email, is_active: true, deleted_at: null },
                transaction: t
            })
        ]);

        const account = superadmin || user;

        if (!account) {
            await t.rollback();
            return commonService.notFound(res, enMessage.auth.emailNotFound);
        }

        // Generate reset token (expires in 1 hour)
        const resetToken = jwt.sign(
            { id: account.id, type: superadmin ? 'superadmin' : 'user' },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Save reset token to database
        const resetField = superadmin ? 'reset_password_token' : 'password_reset_token';
        await account.update({
            [resetField]: resetToken,
            reset_token_expires_at: new Date(Date.now() + 3600000) // 1 hour from now
        }, { transaction: t });

        // TODO: Send email with reset link
        // await sendPasswordResetEmail(account.email, resetToken);

        await t.commit();

        return commonService.okResponse(res, {
            message: enMessage.auth.passwordResetLinkSent,
            // In production, don't send the token in response
            // This is just for testing
            resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
        });

    } catch (error) {
        await t.rollback();
        console.error('Forgot password error:', error);
        return commonService.handleError(res, error);
    }
};

const resetPassword = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { token, newPassword, confirmPassword } = req.body;

        if (!token || !newPassword || !confirmPassword) {
            return commonService.badRequest(res, enMessage.auth.allFieldsRequired);
        }

        if (newPassword !== confirmPassword) {
            return commonService.badRequest(res, enMessage.auth.passwordsDontMatch);
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return commonService.unauthorized(res, enMessage.auth.invalidOrExpiredToken);
        }

        const { id, type } = decoded;
        const model = type === 'superadmin' ? models.SuperAdminProfile : models.User;

        const account = await model.findOne({
            where: {
                id,
                reset_token_expires_at: { [Op.gt]: new Date() }
            },
            transaction: t
        });

        if (!account) {
            await t.rollback();
            return commonService.unauthorized(res, enMessage.auth.invalidOrExpiredToken);
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear reset token
        await account.update({
            password: hashedPassword,
            reset_password_token: null,
            reset_token_expires_at: null
        }, { transaction: t });

        await t.commit();

        return commonService.okResponse(res, {
            message: enMessage.auth.passwordResetSuccessful
        });

    } catch (error) {
        await t.rollback();
        console.error('Reset password error:', error);
        return commonService.handleError(res, error);
    }
};

module.exports = {
    login,
    forgotPassword,
    resetPassword
};