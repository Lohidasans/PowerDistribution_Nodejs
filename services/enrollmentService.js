const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Field validation helper
const validateRequired = (req, res, fields) => {
  for (const f of fields) {
    const v = req.body?.[f];
    if (v === undefined || v === null || v === "") {
      commonService.badRequest(res, enMessage.failure.requiredFields);
      return false;
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
      "email",
      "address",
      "country_id",
      "state_id",
      "district_id",
      "pincode",
      "scheme_plan_id",
      "installment_amount_id",
      "identity_proof_id",
      "identity_proof_no",
    ];
    if (!validateRequired(req, res, required)) return;

    const payload = {
      customer_id: req.body.customer_id ?? null,
      mobile_number: String(req.body.mobile_number),
      customer_no: String(req.body.customer_no),
      customer_name: req.body.customer_name,
      email: req.body.email,
      address: req.body.address,
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

    const row = await models.Enrollment.create(payload);
    return commonService.createdResponse(res, { enrollment: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get all enrollments
const listEnrollments = async (req, res) => {
  try {
    const {
      type, // total | active | completed | not_enrolled
      branch_id,
      mode,
      search,
      page,
      limit
    } = req.query;

    // ================= PAGINATION =================
    let pagination = false;
    let replacements = {};

    if (page && limit) {
      pagination = true;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      replacements.limit = parseInt(limit);
      replacements.offset = offset;
    }

    let sql = ``;

    // =====================================================
    // 🟡 NOT ENROLLED
    // =====================================================
    if (type === "not_enrolled") {
      sql = `
        SELECT 
          c.id,
          NULL AS scheme_id,
          c.customer_name,
          c.mobile_number,
          NULL AS date_of_scheme,
          '-' AS scheme_name,
          '-' AS scheme_type,
          '-' AS duration,
          0 AS installment_amount,

          CASE 
            WHEN c.is_online = true THEN 'Online'
            ELSE 'Offline'
          END AS mode,

          c.branch_id,
          b.branch_name,

          '0/0' AS dues

        FROM customers c

        LEFT JOIN customer_enrollments e 
          ON e.customer_id = c.id 
          AND e.deleted_at IS NULL

        LEFT JOIN branches b 
          ON b.id = c.branch_id

        WHERE c.deleted_at IS NULL
          AND e.id IS NULL
      `;
    } else {
      // =====================================================
      // 🟢 ENROLLMENT DATA
      // =====================================================
      sql = `
        SELECT
          e.id,
          e.enrollment_code AS scheme_id,
          e.customer_name,
          e.mobile_number,
          e.created_at AS date_of_scheme,

          s.scheme_name,
          st.type_name AS scheme_type,
          d.duration_name AS duration,

          -- FIXED INSTALLMENT (IMPORTANT)
          e.installment_amount_id AS installment_amount,

          CASE
            WHEN c.is_online = true THEN 'Online'
            ELSE 'Offline'
          END AS mode,

          c.branch_id,
          b.branch_name,

          COALESCE(p.paid_count, 0) AS paid_installments,
          COALESCE(d.months, 12) AS total_installments,

          CONCAT(
            COALESCE(p.paid_count, 0), '/', COALESCE(d.months, 12)
          ) AS dues

        FROM customer_enrollments e

        LEFT JOIN customers c 
          ON c.id = e.customer_id 
          AND c.deleted_at IS NULL

        LEFT JOIN branches b 
          ON b.id = c.branch_id

        LEFT JOIN schemes s 
          ON s.id = e.scheme_plan_id 
          AND s.deleted_at IS NULL

        LEFT JOIN scheme_types st 
          ON st.id = s.scheme_type_id

        LEFT JOIN scheme_durations d 
          ON d.id = s.duration_id

        LEFT JOIN (
          SELECT 
            enrollment_id,
            COUNT(*) AS paid_count
          FROM customer_scheme_payments
          WHERE deleted_at IS NULL
          GROUP BY enrollment_id
        ) p ON p.enrollment_id = e.id

        WHERE e.deleted_at IS NULL
      `;

      // ================= TYPE FILTER =================
      if (type === "active") {
        sql += `
          AND COALESCE(p.paid_count, 0) < COALESCE(d.months, 12)
        `;
      }

      if (type === "completed") {
        sql += `
          AND COALESCE(p.paid_count, 0) >= COALESCE(d.months, 12)
        `;
      }
    }

    // =====================================================
    // 🔍 COMMON FILTERS
    // =====================================================

    if (branch_id) {
      sql += ` AND c.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    if (mode) {
      if (mode === "Online") {
        sql += ` AND c.is_online = true`;
      } else if (mode === "Offline") {
        sql += ` AND (c.is_online = false OR c.is_online IS NULL)`;
      }
    }

    if (search) {
      sql += `
        AND (
          ${type === "not_enrolled" ? "c.customer_name" : "e.customer_name"} ILIKE :search
          OR ${type === "not_enrolled" ? "c.mobile_number" : "e.mobile_number"} ILIKE :search
          ${type !== "not_enrolled" ? "OR e.enrollment_code ILIKE :search" : ""}
          ${type !== "not_enrolled" ? "OR s.scheme_name ILIKE :search" : ""}
        )
      `;
      replacements.search = `%${search}%`;
    }

    // ================= ORDER =================
    sql += ` ORDER BY 1 DESC`;

    // ================= PAGINATION =================
    if (pagination) {
      sql += ` LIMIT :limit OFFSET :offset`;
    }

    const [rows] = await sequelize.query(sql, { replacements });

    // =====================================================
    // 📊 SCORE CARDS (UPDATED FOR BOTH SCREENS)
    // =====================================================
    const scoreSql = `
      SELECT 
        (SELECT COUNT(*) 
         FROM customer_enrollments 
         WHERE deleted_at IS NULL) AS total_enrollment,

        (SELECT COUNT(*) 
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
           AND COALESCE(p.paid_count, 0) < COALESCE(d.months, 12)
        ) AS active,

        (SELECT COUNT(*) 
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
           AND COALESCE(p.paid_count, 0) >= COALESCE(d.months, 12)
        ) AS completed,

        (SELECT COUNT(*) 
         FROM customers c
         LEFT JOIN customer_enrollments e 
           ON e.customer_id = c.id AND e.deleted_at IS NULL
         WHERE c.deleted_at IS NULL 
           AND e.id IS NULL
        ) AS not_enrolled,

        -- 💰 NEW FIELD
        (SELECT COALESCE(SUM(paid_amount), 0)
         FROM customer_scheme_payments
         WHERE deleted_at IS NULL
        ) AS total_value_till_date
    `;

    const [summary] = await sequelize.query(scoreSql);

    // ================= RESPONSE =================
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

module.exports = {
  createEnrollment,
  listEnrollments,
  getEnrollmentById,
  generateEnrollmentCode
};

