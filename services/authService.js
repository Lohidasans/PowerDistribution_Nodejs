// services/authService.js
const jwt = require('jsonwebtoken');
const { models, sequelize } = require('../models');
const { Op } = require('sequelize');
const commonService = require('./commonService');
const enMessage = require('../constants/en.json');
const { JWT_SECRET, JWT_EXPIRES_IN } = process.env;
const otpCache = require('../utils/otpCache');
const { generateOnlineCustomerCode } = require('./customerService');
const login = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return commonService.badRequest(res, enMessage.auth.emailPasswordRequired);
        }

        // Find user in users table
        const user = await models.User.findOne({
            where: { email,  deleted_at: null },
            transaction: t
        });

        if (!user) {
            await t.rollback();
            return commonService.notFound(res, enMessage.auth.invalidCredentials);
        }

        // Check if user has a password set
        if (!user.password_hash) {
            await t.rollback();
            return commonService.notFound(res, enMessage.auth.invalidCredentials);
        }

        // Check password
        const isPasswordValid = password === user.password_hash;
        if (!isPasswordValid) {
            await t.rollback();
            return commonService.notFound(res, enMessage.auth.invalidCredentials);
        }

        // Fetch entity details based on entity_type
        let entityDetails = null;
        const entityType = user.entity_type;
        const entityId = user.entity_id;

        if (entityId && entityType) {
            switch (entityType) {
                case 'branch':
                    entityDetails = await models.Branch.findOne({
                        where: { id: entityId, deleted_at: null },
                        transaction: t
                    });
                    break;
                case 'employee':
                    entityDetails = await models.Employee.findOne({
                        where: { id: entityId, deleted_at: null },
                        transaction: t
                    });
                    break;
                case 'vendor':
                    entityDetails = await models.Vendor.findOne({
                        where: { id: entityId, deleted_at: null },
                        transaction: t
                    });
                    break;
                case 'superadmin':
                    entityDetails = await models.SuperAdminProfile.findOne({
                        where: { id: entityId, deleted_at: null },
                        transaction: t
                    });
                    break;
                default:
                    // No entity details for unknown types
                    break;
            }
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                entity_type: entityType,
                entity_id: entityId,
                // Add any other relevant user data
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN || '24h' }
        );

        // Update last login
        await user.update({ last_login_at: new Date() }, { transaction: t });

        await t.commit();

        // Return user data without password
        const { password: _, ...userData } = user.get({ plain: true });

        return commonService.okResponse(res, {
            message: enMessage.auth.loginSuccess,
            token,
            user: {
                ...userData,
                entity_details: entityDetails ? entityDetails.get({ plain: true }) : null
            }
        });

    } catch (error) {
        // Only rollback if transaction is still active
        if (t && !t.finished) {
            await t.rollback();
        }
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
        // Only rollback if transaction is still active
        if (t && !t.finished) {
            await t.rollback();
        }
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

        // Update password and clear reset token
        await account.update({
            password: newPassword,
            reset_password_token: null,
            reset_token_expires_at: null
        }, { transaction: t });

        await t.commit();

        return commonService.okResponse(res, {
            message: enMessage.auth.passwordResetSuccessful
        });

    } catch (error) {
        // Only rollback if transaction is still active
        if (t && !t.finished) {
            await t.rollback();
        }
        console.error('Reset password error:', error);
        return commonService.handleError(res, error);
    }
};
const customerSendOTP = async (req, res) => {
    try {
        const { mobile } = req.body;

        if (!mobile) {
            return commonService.badRequest(res, "Mobile number is required");
        }

        // generate 4 digit otp
    //   const otp = Math.floor(1000 + Math.random() * 9000);
const otp = '1234'; // for testing purpose, use a fixed OTP

        // store in memory cache
        otpCache.setOTP(mobile, otp);

        return commonService.okResponse(res, {
            message: "OTP sent successfully",
            otp: process.env.NODE_ENV === "development" ? otp : undefined
        });

    } catch (error) {
        console.error("Send OTP error:", error);
        return commonService.handleError(res, error);
    }
};
const verifyOTP = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { mobile, otp } = req.body;

        if (!mobile || !otp) {
            return commonService.badRequest(res, "Mobile number and OTP are required");
        }

        const cachedOtp = otpCache.getOTP(mobile);

        if (!cachedOtp || cachedOtp !== otp.toString()) {
            return commonService.unauthorized(res, "Invalid or expired OTP");
        }

        // remove otp after success
        otpCache.deleteOTP(mobile);

        // check customer table
        let customer = await models.Customer.findOne({
            where: { mobile_number: mobile },
            transaction: t
        });

        let statusCode = 200;

        if (!customer) {

            // ✅ generate customer code before create
            const customerCode = await generateOnlineCustomerCode(
                models.Customer,
                "customer_code",
                "COD",          // hardcoded prefix
                { pad: 3 }
            );

            customer = await models.Customer.create({
                customer_code: customerCode,
                mobile_number: mobile,
                is_active: true
            }, { transaction: t });

            statusCode = 201;
        }

        await t.commit();

        return res.status(statusCode).json({
            status: true,
            message: "OTP verified successfully",
            customer,
            isNewCustomer: statusCode === 201
        });

    } catch (error) {
        // Only rollback if transaction is still active
        if (t && !t.finished) {
            await t.rollback();
        }
        console.error("Verify OTP error:", error);
        return commonService.handleError(res, error);
    }
};


module.exports = {
    login,
    forgotPassword,
    resetPassword,
    customerSendOTP,
    verifyOTP
};