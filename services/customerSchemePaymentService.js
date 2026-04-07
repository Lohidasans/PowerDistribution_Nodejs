const commonService = require("./commonService");
const { models, sequelize } = require("../models");


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

        //  BLOCK IF CLOSED
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

        // ================= LAST INSTALLMENT =================
        const lastPayment = await models.CustomerSchemePayment.findOne({
            where: { enrollment_id },
            order: [["installment_no", "DESC"]],
            transaction: t,
        });

        const nextInstallment = lastPayment ? lastPayment.installment_no + 1 : 1;

        if (nextInstallment > duration.months) {
            throw new Error("All installments already completed");
        }

        // ================= PREVENT DUPLICATE =================
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

        // ================= CREATE SCHEME PAYMENT =================
        const schemePayment = await models.CustomerSchemePayment.create({
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

        // ================= CREATE MULTIPLE PAYMENT ROWS =================
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

module.exports = {
    createSchemePayment,
    closeEnrollment
};