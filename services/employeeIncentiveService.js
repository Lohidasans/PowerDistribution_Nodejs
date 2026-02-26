const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

// Validate required fields
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

// Create
const createIncentive = async (req, res) => {
  try {
    const required = ["role_id", "department_id", "sales_target", "incentive_type", "incentive_value"];
    if (!validateRequired(req, res, required)) return;

    const payload = {
      role_id: +req.body.role_id,
      department_id: +req.body.department_id,
      sales_target: Array.isArray(req.body.sales_target) ? req.body.sales_target.map((n) => +n) : [],
      incentive_type: req.body.incentive_type,
      incentive_value: +req.body.incentive_value,
    };

    const row = await models.EmployeeIncentive.create(payload);
    return commonService.createdResponse(res, { incentive: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List with filters and search
const listIncentives = async (req, res) => {
  try {
    const { department_id, role_id, search } = req.query || {};

    let query = `
      SELECT
        ei.id,
        ei.role_id,
        r.role_name,
        ei.department_id,
        d.department_name,
        ei.sales_target,
        ei.incentive_type,
        ei.incentive_value,
        ei.created_at,
        ei.updated_at
      FROM employee_incentives ei
      LEFT JOIN roles r ON r.id = ei.role_id AND r.deleted_at IS NULL
      LEFT JOIN "employee_departments" d ON d.id = ei.department_id AND d.deleted_at IS NULL
      WHERE ei.deleted_at IS NULL`;

    const replacements = {};

    if (department_id) {
      query += ` AND ei.department_id = :department_id`;
      replacements.department_id = +department_id;
    }
    if (role_id) {
      query += ` AND ei.role_id = :role_id`;
      replacements.role_id = +role_id;
    }
    if (search) {
      query += ` AND (
        COALESCE(r.role_name, '') ILIKE :like OR
        COALESCE(d.department_name, '') ILIKE :like OR
        COALESCE(ei.incentive_type::text, '') ILIKE :like
      )`;
      replacements.like = `%${search}%`;
    }

    query += ` ORDER BY ei.id DESC`;

    const [rows] = await sequelize.query(query, { replacements });
    return commonService.okResponse(res, { incentives: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get by ID (with joined names)
const getIncentiveById = async (req, res) => {
  try {
    const id = +req.params.id;

    const incentive = await models.EmployeeIncentive.findOne({
      where: { id, deleted_at: null },
    });

    if (!incentive)
      return commonService.notFound(res, enMessage.failure.notFound);

    return commonService.okResponse(res, { incentive });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update
const updateIncentive = async (req, res) => {
  try {
    const entity = await models.EmployeeIncentive.findByPk(req.params.id);
    if (!entity) return commonService.notFound(res, enMessage.failure.notFound);

    const up = {
      role_id: req.body.role_id !== undefined ? +req.body.role_id : entity.role_id,
      department_id: req.body.department_id !== undefined ? +req.body.department_id : entity.department_id,
      sales_target: Array.isArray(req.body.sales_target) ? req.body.sales_target.map((n) => +n) : entity.sales_target,
      incentive_type: req.body.incentive_type ?? entity.incentive_type,
      incentive_value: req.body.incentive_value !== undefined ? +req.body.incentive_value : entity.incentive_value,
    };

    await entity.update(up);
    return commonService.okResponse(res, { incentive: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteIncentive = async (req, res) => {
  try {
    const entity = await models.EmployeeIncentive.findByPk(req.params.id);
    if (!entity) return commonService.notFound(res, enMessage.failure.notFound);
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Employee Incentive Report
// Lists all employees with their Sales Amount (SUM of subtotal_amount from sales_invoice_bills),
// Total No. of Invoices, matched Target Range from employee_incentives, and computed Incentives Amount.
const getEmployeeIncentiveReport = async (req, res) => {
  try {
    const { branch_id, department_id, role_id, from_date, to_date, month, year, search } = req.query || {};

    const replacements = {};

    // Date filter priority:
    //  1. month + year  → specific month of a year
    //  2. year only     → full financial/calendar year
    //  3. from_date + to_date → explicit range
    //  4. from_date only / to_date only
    let dateFilter = "";
    if (month && year) {
      dateFilter = `AND EXTRACT(MONTH FROM sib.invoice_date) = :month AND EXTRACT(YEAR FROM sib.invoice_date) = :year`;
      replacements.month = +month;
      replacements.year = +year;
    } else if (year) {
      dateFilter = `AND EXTRACT(YEAR FROM sib.invoice_date) = :year`;
      replacements.year = +year;
    } else if (from_date && to_date) {
      dateFilter = `AND sib.invoice_date BETWEEN :from_date AND :to_date`;
      replacements.from_date = from_date;
      replacements.to_date = to_date;
    } else if (from_date) {
      dateFilter = `AND sib.invoice_date >= :from_date`;
      replacements.from_date = from_date;
    } else if (to_date) {
      dateFilter = `AND sib.invoice_date <= :to_date`;
      replacements.to_date = to_date;
    }


    // Optional filters
    let employeeWhere = "";
    if (branch_id) {
      employeeWhere += ` AND e.branch_id = :branch_id`;
      replacements.branch_id = +branch_id;
    }
    if (department_id) {
      employeeWhere += ` AND e.department_id = :department_id`;
      replacements.department_id = +department_id;
    }
    if (role_id) {
      employeeWhere += ` AND e.role_id = :role_id`;
      replacements.role_id = +role_id;
    }
    if (search) {
      employeeWhere += ` AND (
        e.employee_name ILIKE :search OR
        e.employee_no ILIKE :search OR
        b.branch_name ILIKE :search OR
        dept.department_name ILIKE :search OR
        r.role_name ILIKE :search
      )`;
      replacements.search = `%${search}%`;
    }

    // Use a CTE to first aggregate sales per employee, then join against
    // employee_incentives — PostgreSQL disallows aggregate functions in JOIN ON clauses.
    const query = `
      WITH emp_sales AS (
        SELECT
          e.id                              AS employee_id,
          e.employee_no,
          e.employee_name,
          e.profile_image_url,
          e.department_id,
          e.role_id,
          b.id                              AS branch_id,
          b.branch_name,
          dept.id                           AS department_id_ref,
          dept.department_name,
          r.id                              AS role_id_ref,
          r.role_name                       AS designation,
          COALESCE(SUM(sib.net_total), 0)::numeric AS sales_amount,
          COUNT(DISTINCT sib.id)::int        AS total_no_of_invoice
        FROM employees e
        LEFT JOIN branches b
          ON b.id = e.branch_id AND b.deleted_at IS NULL
        LEFT JOIN employee_departments dept
          ON dept.id = e.department_id AND dept.deleted_at IS NULL
        LEFT JOIN roles r
          ON r.id = e.role_id AND r.deleted_at IS NULL
        LEFT JOIN sales_invoice_bills sib
          ON sib.employee_id = e.id
          AND sib.deleted_at IS NULL
          AND sib.status = 'Invoice'
          ${dateFilter}
        WHERE e.deleted_at IS NULL
          ${employeeWhere}
        GROUP BY
          e.id, e.employee_no, e.employee_name, e.profile_image_url,
          e.department_id, e.role_id,
          b.id, b.branch_name,
          dept.id, dept.department_name,
          r.id, r.role_name
      )
      SELECT
        es.*,
        ei.id              AS incentive_id,
        ei.sales_target,
        ei.incentive_type,
        ei.incentive_value,
        CASE
          WHEN ei.incentive_type = 'Percentage'
            THEN ROUND((es.sales_amount * ei.incentive_value / 100), 2)
          WHEN ei.incentive_type = 'Rupees'
            THEN ei.incentive_value::numeric
          ELSE 0
        END                AS incentives_amount
      FROM emp_sales es
      LEFT JOIN employee_incentives ei
        ON ei.department_id = es.department_id
        AND ei.role_id      = es.role_id
        AND ei.deleted_at IS NULL
        AND es.sales_amount >= ei.sales_target[1]
        AND es.sales_amount <= ei.sales_target[2]
      ORDER BY es.branch_name ASC, es.employee_name ASC
    `;

    const rows = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const report = rows.map((row, idx) => {
      // Build target range label e.g. "₹2,00,000 - ₹4,00,000"
      let target_range = null;
      if (row.sales_target && Array.isArray(row.sales_target) && row.sales_target.length >= 2) {
        target_range = `₹${Number(row.sales_target[0]).toLocaleString('en-IN')} - ₹${Number(row.sales_target[1]).toLocaleString('en-IN')}`;
      }

      return {
        s_no: idx + 1,
        employee_id: row.employee_id,
        employee_no: row.employee_no,
        employee_name: row.employee_name,
        profile_image_url: row.profile_image_url || null,
        branch_id: row.branch_id,
        branch_name: row.branch_name,
        department_id: row.department_id,
        department_name: row.department_name,
        role_id: row.role_id,
        designation: row.designation,
        sales_amount: parseFloat(row.sales_amount || 0).toFixed(2),
        total_no_of_invoice: row.total_no_of_invoice || 0,
        target_range,
        incentive_type: row.incentive_type || null,
        incentive: row.incentive_value
          ? (row.incentive_type === 'Percentage' ? `${row.incentive_value}%` : `₹${Number(row.incentive_value).toLocaleString('en-IN')}`)
          : null,
        incentives_amount: row.incentives_amount ? parseFloat(row.incentives_amount).toFixed(2) : '0.00',
      };
    });

    return commonService.okResponse(res, { report });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

/**
 * Pure helper (no req/res) — callable from the scheduler.
 * Returns the calculated incentive amount for one employee for a given pay month.
 *
 * @param {number} employeeId  - employees.id
 * @param {string} payMonth    - "YYYY-MM"
 * @returns {number}           - incentives_amount (0 if no matching incentive tier)
 */
const getIncentiveAmountForEmployee = async (employeeId, payMonth) => {
  const [yearStr, monthStr] = payMonth.split('-');
  const month = +monthStr;
  const year = +yearStr;

  const query = `
    WITH emp_sales AS (
      SELECT
        e.id            AS employee_id,
        e.department_id,
        e.role_id,
        COALESCE(SUM(sib.net_total), 0)::numeric AS sales_amount
      FROM employees e
      LEFT JOIN sales_invoice_bills sib
        ON sib.employee_id = e.id
        AND sib.deleted_at IS NULL
        AND sib.status = 'Invoice'
        AND EXTRACT(MONTH FROM sib.invoice_date) = :month
        AND EXTRACT(YEAR  FROM sib.invoice_date) = :year
      WHERE e.id = :employeeId
        AND e.deleted_at IS NULL
      GROUP BY e.id, e.department_id, e.role_id
    )
    SELECT
      CASE
        WHEN ei.incentive_type = 'Percentage'
          THEN ROUND((es.sales_amount * ei.incentive_value / 100), 2)
        WHEN ei.incentive_type = 'Rupees'
          THEN ei.incentive_value::numeric
        ELSE 0
      END AS incentives_amount
    FROM emp_sales es
    LEFT JOIN employee_incentives ei
      ON ei.department_id = es.department_id
      AND ei.role_id      = es.role_id
      AND ei.deleted_at IS NULL
      AND es.sales_amount >= ei.sales_target[1]
      AND es.sales_amount <= ei.sales_target[2]
    LIMIT 1
  `;

  const [row] = await sequelize.query(query, {
    replacements: { employeeId, month, year },
    type: sequelize.QueryTypes.SELECT,
  });

  return parseFloat(row?.incentives_amount || 0);
};

module.exports = {
  createIncentive,
  listIncentives,
  getIncentiveById,
  updateIncentive,
  deleteIncentive,
  getEmployeeIncentiveReport,
  getIncentiveAmountForEmployee,
};
