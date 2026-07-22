// services/authService.js
const jwt = require('jsonwebtoken');
const { models, sequelize } = require('../models');
const { Op } = require('sequelize');
const commonService = require('./commonService');
const enMessage = require('../constants/en.json');
const { JWT_SECRET, JWT_EXPIRES_IN } = process.env;
const otpCache = require('../utils/otpCache');
const { generateOnlineCustomerCode, ensureCustomerLedger } = require('./customerService');
const {sendCustomerNotification,} = require("../helpers/notificationHelper");
const notificationMessages = require("../constants/notificationMessages");
const { sendPushToSubscribers } = require("./pushNotificationService");

const login = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return commonService.badRequest(res, enMessage.auth.emailPasswordRequired);
        }

        // Find user in users table
        const user = await models.User.findOne({
            where: { email, deleted_at: null },
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

                    // Check if branch is Active
                    if (entityDetails && entityDetails.status !== 'Active') {
                        await t.rollback();
                        return commonService.notFound(res, 'Your branch account is inactive. Please contact administrator.');
                    }
                    break;
                case 'employee':
                    entityDetails = await models.Employee.findOne({
                        where: { id: entityId, deleted_at: null },
                        transaction: t
                    });

                    // Check if employee is Active
                    if (entityDetails && entityDetails.status !== 'Active') {
                        await t.rollback();
                        return commonService.notFound(res, 'Your employee account is inactive. Please contact administrator.');
                    }
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
                    entityDetails = await models.Employee.findOne({
                        where: { id: entityId, deleted_at: null },
                        transaction: t
                    });

                    // Check if employee is Active for default case
                    if (entityDetails && entityDetails.status !== 'Active') {
                        await t.rollback();
                        return commonService.unauthorized(res, 'Your employee account is inactive. Please contact administrator.');
                    }
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

        // Send push notification to this user's browser (non-blocking)
        const entityName = entityDetails
          ? (entityDetails.name || entityDetails.branch_name || entityDetails.first_name || entityType)
          : entityType;
        sendPushToSubscribers({
          ...notificationMessages.push_adminLogin(entityName),
          user_type: entityType,
          user_id: entityId,
        }).catch(() => {});

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

        // Send SMS
        /* await sendSMS({
            mobile,
            message: notificationMessages.websiteLoginOtp(otp),
        }); */

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
            return commonService.notFound(res, "Invalid or expired OTP");
        }

        // remove otp after success
        otpCache.deleteOTP(mobile);

        // check customer table
        let customer = await models.Customer.findOne({
            where: { mobile_number: mobile },
            transaction: t
        });

        let statusCode = 200;
        let isNewCustomer = false;

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
            isNewCustomer = true;
        } else {
            // Existing customer (created via offline/counter billing or a
            // prior online order) logging in for the first time online:
            // carry their stored address into customer_addresses so it
            // shows up automatically instead of asking them to re-enter it.
            const hasAddress = await models.CustomerAddress.count({
                where: { customer_id: customer.id },
                transaction: t
            });

            if (
                !hasAddress &&
                customer.address &&
                customer.customer_name &&
                customer.country_id &&
                customer.state_id &&
                customer.district_id &&
                customer.pin_code
            ) {
                await models.CustomerAddress.create({
                    customer_id: customer.id,
                    name: customer.customer_name,
                    mobile_number: customer.mobile_number,
                    address_line: customer.address,
                    country_id: customer.country_id,
                    state_id: customer.state_id,
                    district_id: customer.district_id,
                    pin_code: customer.pin_code,
                    is_default: true
                }, { transaction: t });
            }
        }

        // Offline customers get their Sundry Debtors ledger at creation time;
        // the online flow only registers a mobile number here, so it has to be
        // done at OTP verification instead. Called for existing customers too
        // (not just new ones) because the helper is idempotent — that also
        // backfills anyone who registered before this existed, on next login.
        // Without a ledger the customer's invoices, sales returns and old-gold
        // vouchers are dropped from every financial report.
        //
        // Deliberately allowed to throw and fail the login: a ledger-less
        // customer corrupts the books silently, which is worse than a login
        // error someone will actually report. The whole transaction rolls back,
        // so a new customer is not left half-created.
        await ensureCustomerLedger(customer, t);

        await t.commit();

        /*
        if (isNewCustomer) {
            await sendSMS({
                mobile,
                message:
                notificationMessages.websiteNewCustomerGreeting()
            });
        }
        */

        // Send push notification to this customer's browser (non-blocking)
        const pushMsg = isNewCustomer
          ? notificationMessages.push_newCustomerGreeting()
          : notificationMessages.push_customerLogin();
        sendPushToSubscribers({
          ...pushMsg,
          user_type: 'customer',
          user_id: customer.id,
        }).catch(() => {});

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