const commonService = require("./commonService");
const { models, sequelize } = require("../models");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Generate auto code: SS001
const generateSchemePaymentCode = async (req, res) => {
    try {
        const { prefix } = req.query || {};

        const code = await generateFiscalSeriesCode(
            models.CustomerSchemePayment,
            "scheme_payment_code",
            SS,
            { pad: 3 }
        );
        return commonService.okResponse(res, { scheme_payment_code: code });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Payinstallment via billing side
const createSchemePayment = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { enrollment_id, payment_date, payments } = req.body;

        if (!payments || payments.length === 0) {
            throw new Error("At least one payment required");
        }

        // ================= ENROLLMENT =================
        const enrollment = await models.Enrollment.findByPk(enrollment_id, { transaction: t });

        if (!enrollment) throw new Error("Enrollment not found");

        if (enrollment.status === "Closed") {
            throw new Error("Scheme is closed. Payment not allowed");
        }

        const scheme_id = enrollment.scheme_plan_id;

        // ================= DURATION =================
        const scheme = await models.Scheme.findByPk(scheme_id, { transaction: t });
        const duration = await models.SchemeDuration.findByPk(scheme.duration_id, { transaction: t });

        // ================= CHECK COMPLETED =================
        const paidCount = await models.CustomerSchemePayment.count({
            where: { enrollment_id },
            transaction: t,
        });

        if (paidCount >= duration.months) {
            throw new Error("Scheme already completed. Payment not allowed");
        }

        // ================= NEXT INSTALLMENT =================
        const lastPayment = await models.CustomerSchemePayment.findOne({
            where: { enrollment_id },
            order: [["installment_no", "DESC"]],
            transaction: t,
        });

        const nextInstallment = lastPayment ? lastPayment.installment_no + 1 : 1;

        if (nextInstallment > duration.months) {
            throw new Error("All installments already completed");
        }

        // ================= DUPLICATE CHECK =================
        const existingInstallment = await models.CustomerSchemePayment.findOne({
            where: {
                enrollment_id,
                installment_no: nextInstallment,
            },
            transaction: t,
        });

        if (existingInstallment) {
            throw new Error("Installment already paid");
        }

        // ================= TOTAL AMOUNT =================
        const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        const installmentAmount = Number(enrollment.installment_amount_id);

        if (totalAmount <= 0) {
            throw new Error("Invalid payment amount");
        }

        // ================= GENERATE CODE =================
        const schemePaymentCode = await generateFiscalSeriesCode(
            models.CustomerSchemePayment,
            "scheme_payment_code",
            "SS",
            { pad: 3 }
        );

        // ================= CREATE SCHEME PAYMENT =================
        const schemePayment = await models.CustomerSchemePayment.create({
            scheme_payment_code: schemePaymentCode,
            enrollment_id,
            scheme_id,
            installment_no: nextInstallment,
            installment_amount: installmentAmount,
            paid_amount: totalAmount,
            payment_date,
            payment_source: "INSTALLMENT",
            receipt_id: null,
            status:
                totalAmount >= installmentAmount
                    ? "PAID"
                    : totalAmount > 0
                        ? "PARTIAL"
                        : "FAILED",
        }, { transaction: t });

        // ================= CREATE PAYMENT SPLITS =================
        for (const p of payments) {
            if (!p.amount || p.amount <= 0) continue;

            await models.Payment.create({
                scheme_payment_id: schemePayment.id,
                payment_mode: p.mode,
                amount_received: p.amount,
                payment_date,
                transaction_id: p.transaction_id || null,
                status: "Completed",
            }, { transaction: t });
        }

        await t.commit();

        return commonService.createdResponse(res, {
            message: "Installment paid successfully",
            data: {
                scheme_payment_code: schemePayment.scheme_payment_code,
                installment_no: nextInstallment,
                total_paid: totalAmount,
                status: schemePayment.status
            }
        });

    } catch (err) {
        if (!t.finished) await t.rollback();
        console.error(err);
        return commonService.handleError(res, err);
    }
};

const closeEnrollment = async (req, res) => {
    try {
        const { enrollment_id } = req.body;

        if (!enrollment_id) {
            return commonService.badRequest(res, {
                message: "enrollment_id is required"
            });
        }

        const enrollment = await models.Enrollment.findByPk(enrollment_id);

        if (!enrollment) {
            return commonService.badRequest(res, {
                message: "Enrollment not found"
            });
        }

        // Already closed check
        if (enrollment.status === "Closed") {
            return commonService.badRequest(res, {
                message: "Scheme already closed"
            });
        }

        // Check completed
        const paidCount = await models.CustomerSchemePayment.count({
            where: { enrollment_id }
        });

        const scheme = await models.Scheme.findByPk(enrollment.scheme_plan_id);
        const duration = await models.SchemeDuration.findByPk(scheme.duration_id);

        if (paidCount >= duration.months) {
            return commonService.badRequest(res, {
                message: "Scheme already completed, cannot close"
            });
        }

        // ✅ CLOSE
        await enrollment.update({ status: "Closed" });

        return commonService.okResponse(res, {
            message: "Scheme closed successfully"
        });

    } catch (err) {
        console.error(err);
        return commonService.handleError(res, err);
    }
};

const listSchemeEnrollmentsForAdmin = async (req, res) => {
    try {
        const { type = "ongoing", scheme_id, search, page, limit } = req.query;

        let replacements = {};
        let pagination = false;

        if (page && limit) {
            pagination = true;
            replacements.limit = parseInt(limit);
            replacements.offset = (parseInt(page) - 1) * parseInt(limit);
        }

        let sql = `
      SELECT
        e.id,
        e.enrollment_code AS scheme_no,
        e.customer_name,
        e.mobile_number,
        e.created_at AS date_of_scheme,

        s.scheme_name,
        s.id as scheme_id,

        -- ALWAYS TOTAL PAID
        COALESCE(p.total_paid, 0) AS installment_amount,

        COALESCE(p.paid_count, 0) AS paid_installments,
        d.months AS total_installments,

        CONCAT(
          COALESCE(p.paid_count, 0), '/', d.months
        ) AS dues

      FROM customer_enrollments e

      LEFT JOIN schemes s 
        ON s.id = e.scheme_plan_id

      LEFT JOIN scheme_durations d 
        ON d.id = s.duration_id

      LEFT JOIN (
        SELECT 
          enrollment_id,
          COUNT(*) AS paid_count,
          SUM(paid_amount) AS total_paid
        FROM customer_scheme_payments
        WHERE deleted_at IS NULL
        GROUP BY enrollment_id
      ) p ON p.enrollment_id = e.id

      WHERE e.deleted_at IS NULL
    `;

        // ================= TYPE FILTER =================

        if (type === "ongoing") {
            sql += `
        AND e.status = 'Active'
        AND COALESCE(p.paid_count, 0) < d.months
      `;
        }

        if (type === "completed") {
            sql += `
        AND COALESCE(p.paid_count, 0) >= d.months
      `;
        }

        if (type === "closed") {
            sql += `
        AND e.status = 'Closed'
      `;
        }

        // ================= FILTERS =================

        if (scheme_id) {
            sql += ` AND s.id = :scheme_id`;
            replacements.scheme_id = scheme_id;
        }

        if (search) {
            sql += `
        AND (
          e.customer_name ILIKE :search
          OR e.mobile_number ILIKE :search
          OR e.enrollment_code ILIKE :search
          OR s.scheme_name ILIKE :search
        )
      `;
            replacements.search = `%${search}%`;
        }

        // ================= ORDER =================
        sql += ` ORDER BY e.created_at DESC`;

        if (pagination) {
            sql += ` LIMIT :limit OFFSET :offset`;
        }

        const [rows] = await sequelize.query(sql, { replacements });

        // ================= SUMMARY =================
        const [summary] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE e.status = 'Active'
        ) AS ongoing,

        COUNT(*) FILTER (
          WHERE COALESCE(p.paid_count, 0) >= d.months
        ) AS completed,

        COUNT(*) FILTER (
          WHERE e.status = 'Closed'
        ) AS closed

      FROM customer_enrollments e

      LEFT JOIN schemes s ON s.id = e.scheme_plan_id
      LEFT JOIN scheme_durations d ON d.id = s.duration_id

      LEFT JOIN (
        SELECT enrollment_id, COUNT(*) AS paid_count
        FROM customer_scheme_payments
        WHERE deleted_at IS NULL
        GROUP BY enrollment_id
      ) p ON p.enrollment_id = e.id

      WHERE e.deleted_at IS NULL
    `);

        return commonService.okResponse(res, {
            enrollments: rows,
            summary: summary[0],
            ...(pagination && {
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            })
        });

    } catch (err) {
        console.error(err);
        return commonService.handleError(res, err);
    }
};
/*
const getSchemeReceipt = async (req, res) => {
    try {
        const { scheme_payment_id } = req.params;

        if (!scheme_payment_id) {
            return commonService.badRequest(res, {
                message: "scheme_payment_id is required",
            });
        }

        // ================= SCHEME PAYMENT =================
        const sp = await models.CustomerSchemePayment.findByPk(scheme_payment_id);

        if (!sp) {
            return commonService.notFound(res, {
                message: "Payment not found",
            });
        }

        // ================= ENROLLMENT =================
        const enrollment = await models.Enrollment.findByPk(sp.enrollment_id);

        // ================= CUSTOMER =================
        const customer = await models.Customer.findByPk(enrollment.customer_id);

        // ================= BRANCH =================
        const branch = await models.Branch.findByPk(customer?.branch_id);

        // ================= RECEIPT =================
        let receipt = null;
        if (sp.receipt_id) {
            receipt = await models.VoucherReceipt.findByPk(sp.receipt_id);
        }

        // ================= PAYMENTS =================
        const payments = await models.Payment.findAll({
            where: { scheme_payment_id: sp.id },
        });

        let cash = 0;
        let upi = 0;
        let card = 0;
        let upi_txn = null;
        let card_txn = null;

        for (const p of payments) {
            if (p.payment_mode === "Cash") {
                cash += Number(p.amount_received);
            }

            if (p.payment_mode === "UPI") {
                upi += Number(p.amount_received);
                upi_txn = p.transaction_id;
            }

            if (p.payment_mode === "Card") {
                card += Number(p.amount_received);
                card_txn = p.transaction_id;
            }
        }

        // ================= NEXT DUE DATE =================
        const scheme = await models.Scheme.findByPk(sp.scheme_id);
        const duration = await models.SchemeDuration.findByPk(scheme.duration_id);

        const nextDate = new Date(sp.payment_date);
        nextDate.setMonth(nextDate.getMonth() + 1);

        // ================= RESPONSE =================
        return commonService.okResponse(res, {
            receipt_details: {
                receipt_no: receipt?.receipt_no || `SCH-${sp.id}`,
                date: sp.payment_date,
                bill_type: "Saving Scheme",
                installment_amount: sp.installment_amount,
                next_due: nextDate,
                amount_in_words: convertToWords(sp.paid_amount), // optional helper
            },

            customer_details: {
                customer_name: customer?.customer_name,
            },

            payment_details: {
                cash,
                upi,
                upi_transaction: upi_txn,
                card,
                card_transaction: card_txn,
            },

            branch_details: {
                address: branch?.address,
                mobile: branch?.mobile,
                gst_no: branch?.gst_no,
                signature: branch?.signature_url,
            },
        });

    } catch (err) {
        console.error(err);
        return commonService.handleError(res, err);
    }
};
*/
module.exports = {
    generateSchemePaymentCode,
    createSchemePayment,
    closeEnrollment,
    listSchemeEnrollmentsForAdmin,
};