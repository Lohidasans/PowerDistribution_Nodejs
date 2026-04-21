const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Field validation helper
const validateRequired = (req, res, fields) => {
  for (const f of fields) {
    const v = req.body?.[f];

    if (v === undefined || v === null || v === "") {
      return commonService.badRequest(
        res,
        `${f} is required`   // ✅ show field name
      );
    }
  }
  return true;
};

// Create enrollment
const createEnrollment = async (req, res) => {
  try {
    const required = [
      "enrollment_code",
      "customer_no",
      "customer_name",
      "mobile_number",
      "country_id",
      "state_id",
      "district_id",
      "scheme_plan_id",
      "installment_amount_id",
      "identity_proof_id",
      "identity_proof_no",
    ];
    if (!validateRequired(req, res, required)) return;

    const payload = {
      enrollment_code: String(req.body.enrollment_code),
      customer_id: req.body.customer_id ?? null,
      mobile_number: String(req.body.mobile_number),
      customer_no: String(req.body.customer_no),
      customer_name: req.body.customer_name,
      email: req.body.email ?? null,
      address: req.body.address ?? null,
      country_id: +req.body.country_id,
      state_id: +req.body.state_id,
      district_id: +req.body.district_id,
      pincode: String(req.body.pincode),
      scheme_plan_id: +req.body.scheme_plan_id,
      installment_amount_id: +req.body.installment_amount_id,
      identity_proof_id: +req.body.identity_proof_id,
      identity_proof_no: String(req.body.identity_proof_no),
      nominee: req.body.nominee ?? null,
      nominee_relation_id: req.body.nominee_relation_id !== undefined ? +req.body.nominee_relation_id : null,
      status: req.body.status ?? "Active",
    };

    // Check if customer is already enrolled for this scheme
    if (req.body.customer_id) {
      const existingEnrollment = await models.Enrollment.findOne({
        where: {
          customer_id: req.body.customer_id,
          scheme_plan_id: +req.body.scheme_plan_id,
          status: "Active",
          deleted_at: null
        }
      });

      if (existingEnrollment) {
        return commonService.badRequest(res, {
          message: "Customer already enrolled for this scheme"
        });
      }
    }

    const row = await models.Enrollment.create(payload);
    return commonService.createdResponse(res, { enrollment: row });
  } catch (err) {
    // Handle Sequelize validation errors with specific field info
    if (err.name === "SequelizeValidationError" || err.name === "SequelizeUniqueConstraintError") {
      const errorDetails = err.errors?.map(e => ({
        field: e.path,
        message: e.message
      })) || [];
      return commonService.badRequest(res, {
        message: "Validation failed",
        errors: errorDetails
      });
    }
    return commonService.handleError(res, err);
  }
};

// Get all enrollments
// Get all enrollments
const listEnrollments = async (req, res) => {
  try {
    const {
      type,
      branch_id,
      mode,
      search,
      page,
      limit,
      scheme_id,
      customer_id
    } = req.query;

    const hasPagination =
      Number(page) > 0 && Number(limit) > 0;

    const replacements = {};

    if (hasPagination) {
      replacements.limit = parseInt(limit);
      replacements.offset = (parseInt(page) - 1) * parseInt(limit);
    }

    if (scheme_id) replacements.scheme_id = scheme_id;
    if (customer_id) replacements.customer_id = customer_id;
    if (branch_id) replacements.branch_id = branch_id;
    if (search) replacements.search = `%${search}%`;

    let sql = "";

    // ================= NOT ENROLLED =================
    if (type === "not_enrolled") {
      sql = `
        SELECT
          c.id,
          NULL AS scheme_enrolled_code,
          c.customer_name,
          c.mobile_number,
          NULL AS date_of_scheme,
          '-' AS scheme_name,
          '-' AS scheme_type,
          '-' AS duration,
          0 AS installment_amount,
          CASE WHEN c.is_online THEN 'Online' ELSE 'Offline' END AS mode,
          c.branch_id,
          b.branch_name,
          '0/0' AS dues,
          NULL AS invoice_no,
          NULL AS status

        FROM customers c
        LEFT JOIN customer_enrollments e
          ON e.customer_id = c.id
          AND e.deleted_at IS NULL
        LEFT JOIN branches b ON b.id = c.branch_id

        WHERE c.deleted_at IS NULL
        AND e.id IS NULL
      `;
    }

    // ================= MAIN ENROLLMENT QUERY =================
    else {
      sql = `
        SELECT
          e.id,
          e.enrollment_code AS scheme_enrolled_code,
          c.id AS customer_id,
          e.customer_name,
          e.mobile_number,
          e.created_at AS date_of_scheme,
          e.status,
          s.id AS scheme_id,
          s.scheme_name,
          st.type_name AS scheme_type,
          d.duration_name AS duration,

          CASE
            WHEN COALESCE(p.paid_count,0) >= COALESCE(d.months,12)
              THEN COALESCE(p.total_paid,0)
            ELSE e.installment_amount_id
          END AS installment_amount,

          COALESCE(p.total_paid,0) AS total_paid_amount,

          CASE
            WHEN COALESCE(p.paid_count,0) >= COALESCE(d.months,12)
              THEN NULL
            WHEN p.last_payment_date IS NOT NULL
              THEN (p.last_payment_date + INTERVAL '28 days')
            ELSE (e.created_at + INTERVAL '28 days')
          END AS next_due,

          CASE WHEN c.is_online THEN 'Online' ELSE 'Offline' END AS mode,

          c.branch_id,
          b.branch_name,

          COALESCE(p.paid_count,0) AS paid_installments,
          COALESCE(d.months,12) AS total_installments,

          CONCAT(
            COALESCE(p.paid_count,0), '/', COALESCE(d.months,12)
          ) AS dues,

          sib.invoice_no

        FROM customer_enrollments e
        LEFT JOIN customers c ON c.id = e.customer_id AND c.deleted_at IS NULL
        LEFT JOIN branches b ON b.id = c.branch_id
        LEFT JOIN schemes s ON s.id = e.scheme_plan_id AND s.deleted_at IS NULL
        LEFT JOIN scheme_types st ON st.id = s.scheme_type_id
        LEFT JOIN scheme_durations d ON d.id = s.duration_id

        LEFT JOIN (
          SELECT
            enrollment_id,
            COUNT(*) AS paid_count,
            SUM(paid_amount) AS total_paid,
            MAX(payment_date) AS last_payment_date
          FROM customer_scheme_payments
          WHERE deleted_at IS NULL
          GROUP BY enrollment_id
        ) p ON p.enrollment_id = e.id

        /* CLOSED INVOICE JOIN */
        LEFT JOIN sales_invoice_adjustments sia
          ON sia.reference_id = e.id
          AND sia.adjustment_type_id = '3'
          AND sia.deleted_at IS NULL
          AND e.is_bill_adjusted = true

        LEFT JOIN sales_invoice_bills sib
          ON sib.id = sia.sales_invoice_id
          AND sib.deleted_at IS NULL

        WHERE e.deleted_at IS NULL
      `;


      if (type === "active") {
        sql += ` AND e.status = 'Active' `;
      }

      if (type === "completed") {
        sql += ` AND e.status = 'Completed' `;
      }

      if (type === "closed") {
        sql += ` AND e.status = 'Closed' `;
      }

      if (scheme_id) {
        sql += ` AND s.id = :scheme_id `;
      }
    }

    // ================= COMMON FILTERS =================
    if (branch_id) sql += ` AND c.branch_id = :branch_id `;
    if (customer_id) sql += ` AND c.id = :customer_id `;

    if (mode) {
      if (mode === "Online") {
        sql += ` AND c.is_online = true `;
      } else {
        sql += ` AND (c.is_online = false OR c.is_online IS NULL) `;
      }
    }

    if (search) {
      sql += `
        AND (
          ${type === "not_enrolled" ? "c.customer_name" : "e.customer_name"} ILIKE :search
          OR ${type === "not_enrolled" ? "c.mobile_number" : "e.mobile_number"} ILIKE :search
          ${type !== "not_enrolled" ? "OR e.enrollment_code ILIKE :search" : ""}
          ${type !== "not_enrolled" ? "OR s.scheme_name ILIKE :search" : ""}
          ${type === "closed" ? "OR sib.invoice_no ILIKE :search" : ""}
        )
      `;
    }

    sql += ` ORDER BY e.id DESC NULLS LAST `;

    if (hasPagination) {
      sql += ` LIMIT :limit OFFSET :offset `;
    }

    const [rows] = await sequelize.query(sql, { replacements });

    // ================= SCORECARD =================
    let scoreWhere = ` WHERE e.deleted_at IS NULL `;
    let customerWhere = ` WHERE c.deleted_at IS NULL `;
    let paymentWhere = ` WHERE csp.deleted_at IS NULL `;

    if (branch_id) {
      scoreWhere += ` AND c.branch_id = :branch_id `;
      customerWhere += ` AND c.branch_id = :branch_id `;
      paymentWhere += ` AND c.branch_id = :branch_id `;
    }

    if (customer_id) {
      scoreWhere += ` AND c.id = :customer_id `;
      customerWhere += ` AND c.id = :customer_id `;
      paymentWhere += ` AND c.id = :customer_id `;
    }

    if (mode) {
      if (mode === "Online") {
        scoreWhere += ` AND c.is_online = true `;
        customerWhere += ` AND c.is_online = true `;
        paymentWhere += ` AND c.is_online = true `;
      } else {
        scoreWhere += ` AND (c.is_online = false OR c.is_online IS NULL) `;
        customerWhere += ` AND (c.is_online = false OR c.is_online IS NULL) `;
        paymentWhere += ` AND (c.is_online = false OR c.is_online IS NULL) `;
      }
    }

    if (scheme_id) {
      scoreWhere += ` AND s.id = :scheme_id `;
      paymentWhere += ` AND s.id = :scheme_id `;
    }

    if (search) {
      scoreWhere += `
        AND (
          e.customer_name ILIKE :search
          OR e.mobile_number ILIKE :search
          OR e.enrollment_code ILIKE :search
          OR s.scheme_name ILIKE :search
        )
      `;

      customerWhere += `
        AND (
          c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
        )
      `;
    }

    const scoreSql = `
      SELECT

        (SELECT COUNT(*)
        FROM customer_enrollments e
        LEFT JOIN customers c ON c.id = e.customer_id
        LEFT JOIN schemes s ON s.id = e.scheme_plan_id
        ${scoreWhere}
        AND e.status = 'Active'
        ) AS active,

        (SELECT COUNT(*)
        FROM customer_enrollments e
        LEFT JOIN customers c ON c.id = e.customer_id
        LEFT JOIN schemes s ON s.id = e.scheme_plan_id
        ${scoreWhere}
        AND e.status = 'Completed'
        ) AS completed,

        (SELECT COUNT(*)
        FROM customer_enrollments e
        LEFT JOIN customers c ON c.id = e.customer_id
        LEFT JOIN schemes s ON s.id = e.scheme_plan_id
        ${scoreWhere}
        AND e.status = 'Closed'
        ) AS closed,

        (SELECT COUNT(*)
        FROM customers c
        LEFT JOIN customer_enrollments e
          ON e.customer_id = c.id AND e.deleted_at IS NULL
        ${customerWhere}
        AND e.id IS NULL
        ) AS not_enrolled,

        (SELECT COALESCE(SUM(csp.paid_amount),0)
        FROM customer_scheme_payments csp
        LEFT JOIN customer_enrollments e ON e.id = csp.enrollment_id
        LEFT JOIN customers c ON c.id = e.customer_id
        LEFT JOIN schemes s ON s.id = e.scheme_plan_id
        ${paymentWhere}
        ) AS total_value_till_date
    `;

    const [summary] = await sequelize.query(scoreSql, { replacements });

    return res.json({
      success: true,
      enrollments: rows,
      summary: summary[0],
      ...(hasPagination && {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      })
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}; 

// Get one by ID
const getEnrollmentById = async (req, res) => {
  try {
    const row = await models.Enrollment.findByPk(req.params.id);
    if (!row) return commonService.notFound(res, enMessage.failure.notFound);
    return commonService.okResponse(res, { enrollment: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateEnrollmentCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Enrollment,
      "enrollment_code",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { enrollment_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Admin side - EnrollmentViewById &  For billing side - Get enrolled scheme details with payment history
const getEnrolledSchemeDetailsById = async (req, res) => {
  try {
    const { enrollment_id } = req.params;

    if (!enrollment_id) {
      return commonService.badRequest(res, {
        message: "enrollment_id is required",
      });
    }

    // ================= ENROLLMENT =================
    const enrollment = await models.Enrollment.findByPk(enrollment_id);
    if (!enrollment) {
      return commonService.notFound(res, {
        message: "Enrollment not found",
      });
    }

    // ================= CUSTOMER =================
    const customer = await models.Customer.findByPk(enrollment.customer_id);

    // ================= SCHEME =================
    const scheme = await models.Scheme.findByPk(enrollment.scheme_plan_id);

    //  ADD THIS (FOR DURATION)
    const duration = await models.SchemeDuration.findByPk(
      scheme.duration_id
    );

    // ================= PAYMENTS =================
    const schemePayments = await models.CustomerSchemePayment.findAll({
      where: { enrollment_id },
      order: [["installment_no", "ASC"]],
    });

    const paymentRows = [];

    for (const sp of schemePayments) {
      // ================= RECEIPT LOGIC =================
      let receiptNo = null;

      if (sp.payment_source === "VOUCHER") {
        const receipt = await models.VoucherReceipt.findOne({
          where: {
            id: sp.receipt_id,
            bill_type_id: 5,
            reference_type: "scheme",
            reference_id: enrollment_id,
            account_id: enrollment.customer_id,
          },
        });

        receiptNo = receipt?.receipt_no || null;
      } else {
        // INSTALLMENT FLOW
        receiptNo = sp.scheme_payment_code;
      }

      // ================= PAYMENT BREAKUP =================
      const payments = await models.Payment.findAll({
        where: { scheme_payment_id: sp.id },
      });

      let cash = 0;
      let upi = 0;
      let upi_txn = null;
      let card = 0;
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

      paymentRows.push({
        scheme_payment_id: sp.id,
        date: sp.payment_date,
        receipt_no: receiptNo,
        cash,
        upi,
        upi_txn,
        card,
        card_txn,
      });
    }

    // ================= CALCULATIONS =================
    const paidInstallments = schemePayments.length;
    const totalInstallments = duration?.months || 0;
    const remaining = totalInstallments - paidInstallments;

    //  END DATE CALCULATION
    const startDate = new Date(enrollment.created_at);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + totalInstallments);

    // ================= TOTAL =================
    const totalAmount = paymentRows.reduce(
      (sum, row) => sum + row.cash + row.upi + row.card,
      0
    );

    // ================= RESPONSE =================
    return commonService.okResponse(res, {
      customer_details: {
        customer_id: customer?.customer_code,
        name: customer?.customer_name,
        mobile_number: customer?.mobile_number,
        address: customer?.address,
        pincode: customer?.pin_code,
      },

      plan_details: {
        scheme_name: scheme?.scheme_name,
        date_of_scheme: enrollment.created_at,

        // IMPORTANT FIELDS
        installment_amount: enrollment.installment_amount_id,
        remaining_dues: `${remaining} Months`,
        end_of_scheme: endDate,

        // existing fields
        nominee: enrollment.nominee,
        nominee_relation_id: enrollment.nominee_relation_id,
        identity_proof_id: enrollment.identity_proof_id,
        identity_proof_no: enrollment.identity_proof_no,
      },

      paid_installments: paymentRows,

      total_paid: totalAmount,
    });

  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

// For Admin side and billing side - Get the receipt details of the enrolled scheme with payment breakup
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
      return commonService.notFound(res, { message: "Payment not found" });
    }

    // ================= ENROLLMENT =================
    const enrollment = await models.Enrollment.findByPk(sp.enrollment_id);

    // ================= CUSTOMER =================
    const customer = await models.Customer.findByPk(enrollment.customer_id);

    // ================= SCHEME =================
    const scheme = await models.Scheme.findByPk(enrollment.scheme_plan_id);

    // ================= BRANCH =================
    const branch = await models.Branch.findByPk(scheme.branch_id);

    // MANUAL FETCH STATE & DISTRICT
    let stateName = null;
    let districtName = null;

    if (branch?.state_id) {
      const state = await models.State.findByPk(branch.state_id);
      stateName = state?.state_name || null;
    }

    if (branch?.district_id) {
      const district = await models.District.findByPk(branch.district_id);
      districtName = district?.district_name || null;
    }

    // ================= RECEIPT NUMBER =================
    let receiptNo = null;

    if (sp.payment_source === "VOUCHER") {
      const receipt = await models.VoucherReceipt.findOne({
        where: {
          id: sp.receipt_id,
          bill_type_id: 5,
          reference_type: "scheme",
          reference_id: enrollment.id,
          account_id: enrollment.customer_id,
        },
      });

      receiptNo = receipt?.receipt_no || null;
    } else {
      receiptNo = sp.scheme_payment_code; // INSTALLMENT
    }

    // ================= PAYMENTS =================
    const payments = await models.Payment.findAll({
      where: { scheme_payment_id: sp.id },
    });

    let cash = 0;
    let upi = 0;
    let upi_txn = null;
    let card = 0;
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

    // ================= NEXT DUE =================
    const paymentDate = new Date(sp.payment_date);
    const nextDue = new Date(paymentDate);
    nextDue.setDate(nextDue.getDate() + 28); // ✅ FIXED 28 DAYS

    // ================= RESPONSE =================
    return commonService.okResponse(res, {
      receipt_details: {
        scheme_payment_id: sp.id,
        receipt_no: receiptNo,
        date: sp.payment_date,
        bill_type: "Saving Scheme",
        customer_name: customer?.customer_name,
        installment_amount: sp.paid_amount,
        amount_in_words: convertAmountToWords(sp.paid_amount), // optional helper
        next_due: nextDue,
      },

      payment_breakup: {
        cash,
        upi,
        upi_transaction: upi_txn,
        card,
        card_transaction: card_txn,
      },

      branch_details: {
        branch_name: branch?.branch_name,
        address: branch?.address,
        mobile: branch?.mobile,
        gst_no: branch?.gst_no,
        pincode: branch?.pincode,
        district: districtName,
        state: stateName,    
        signature: branch?.signature_url,
      },
    });

  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

const convertAmountToWords = (amount) => {
  // simple example (you can use library like number-to-words)
  return `${amount} Rupees Only`;
};

module.exports = {
  createEnrollment,
  listEnrollments,
  getEnrollmentById,
  generateEnrollmentCode,
  getEnrolledSchemeDetailsById,
  getSchemeReceipt
};
