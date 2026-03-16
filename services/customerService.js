const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require("sequelize");

// Create customer
const createCustomer = async (req, res) => {
  let transaction;

  try {
    console.log("CreateCustomer API called");
    console.log("Request Body:", req.body);

    const required = ["customer_name", "mobile_number"];

    for (const f of required) {
      if (
        req.body?.[f] === undefined ||
        req.body?.[f] === null ||
        req.body?.[f] === ""
      ) {
        console.log("Missing required field:", f);
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
    }

    const payload = {
      customer_code: req.body.customer_code?.trim() || null,
      customer_name: req.body.customer_name?.trim() || null,
      mobile_number: req.body.mobile_number?.trim(),
      branch_id: req.body.branch_id ? Number(req.body.branch_id) : null,
      email_id: req.body.email_id?.trim() || null,
      gst_no: req.body.gst_no?.trim() || null,
      address: req.body.address?.trim() || null,
      country_id: req.body.country_id ? Number(req.body.country_id) : null,
      state_id: req.body.state_id ? Number(req.body.state_id) : null,
      district_id: req.body.district_id ? Number(req.body.district_id) : null,
      pin_code: req.body.pin_code?.trim() || null,
      pan_no: req.body.pan_no?.trim() || null,
      is_online: Boolean(req.body.is_online),
    };

    console.log("Payload Prepared:", payload);

    // Run duplicate checks before transaction
    const checks = [
      models.Customer.findOne({
        where: {
          mobile_number: payload.mobile_number,
          deleted_at: null,
        },
        attributes: ["id"],
      }),
    ];

    if (payload.customer_code) {
      console.log("Checking duplicate customer_code:", payload.customer_code);

      checks.push(
        models.Customer.findOne({
          where: {
            customer_code: payload.customer_code,
            deleted_at: null,
          },
          attributes: ["id"],
        })
      );
    }

    const [existingMobile, existingCode] = await Promise.all(checks);

    console.log("Duplicate Mobile Check:", existingMobile);
    console.log("Duplicate Code Check:", existingCode);

    if (existingMobile) {
      console.log("Mobile number already exists");
      return commonService.badRequest(res, {
        message: "Mobile number already exists",
      });
    }

    if (existingCode) {
      console.log("Customer code already exists");
      return commonService.badRequest(res, {
        message: "Customer code already exists",
      });
    }

    // Start transaction only when write begins
    console.log("Starting DB Transaction...");
    transaction = await sequelize.transaction();

    const customer = await models.Customer.create(payload, { transaction });

    console.log("Customer created:", customer.id);

    const ledger_no = await generateFiscalSeriesCode(
      models.Ledger,
      "ledger_no",
      "LAID",
      { pad: 3, transaction }
    );

    console.log("Generated Ledger No:", ledger_no);

    const ledger = await models.Ledger.create(
      {
        ledger_no,
        ledger_group_id: 26,
        ledger_name: payload.customer_name,
        branch_id: payload.branch_id,
      },
      { transaction }
    );

    console.log("Ledger created:", ledger.id);

    await customer.update(
      { ledger_id: ledger.id },
      { transaction }
    );

    console.log("Customer updated with ledger_id:", ledger.id);

    await transaction.commit();
    console.log("Transaction committed successfully");

    return commonService.createdResponse(res, { customer });

  } catch (err) {
    console.error("CreateCustomer Error:", err);

    if (transaction) {
      console.log("Rolling back transaction...");
      await transaction.rollback();
    }

    return commonService.handleError(res, err);
  }
};

// List customers (simple filters)
const listCustomersWithMobileNumber = async (req, res) => {
  try {
    const { search, mobile_number } = req.query;

    // Build WHERE conditions dynamically
    let whereClause = "WHERE c.deleted_at IS NULL";
    const replacements = {};

    if (mobile_number) {
      whereClause += " AND c.mobile_number = :mobile_number";
      replacements.mobile_number = mobile_number;
    }

    if (search) {
      whereClause +=
        " AND (c.customer_name ILIKE :search OR c.mobile_number ILIKE :search)";
      replacements.search = `%${search}%`;
    }

    const query = `
      SELECT 
        c.id,
        c.customer_code,
        c.customer_name,
        c.mobile_number,
        c.address,
        c.country_id,
        c.state_id,
        c.district_id,
        c.pin_code,
        c.created_at,
        c.updated_at,
        co.country_name,
        s.state_name,
        d.district_name
      FROM customers c
      LEFT JOIN countries co ON c.country_id = co.id
      LEFT JOIN states s ON c.state_id = s.id
      LEFT JOIN districts d ON c.district_id = d.id
      ${whereClause}
      ORDER BY c.created_at DESC
    `;

    const customers = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      replacements,
    });

    return commonService.okResponse(res, { customers });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get by id
const getCustomerById = async (req, res) => {
  const entity = await commonService.findById(models.Customer, req.params.id, res);
  if (!entity) return;
  return commonService.okResponse(res, { customer: entity });
};

// Update
const updateCustomer = async (req, res) => {
  const entity = await commonService.findById(models.Customer, req.params.id, res);
  if (!entity) return;
  try {
    // Validate code uniqueness if user tries to change it
    if (req.body.customer_code && req.body.customer_code !== entity.customer_code) {
      const existing = await models.Customer.findOne({
        where: {
          customer_code: req.body.customer_code,
          deleted_at: null,
          id: { [Op.ne]: entity.id }, // exclude the current customer
        },
      });

      if (existing) {
        return commonService.badRequest(res, {
          message: "Customer code already exists",
        });
      }
    }

    // Validate mobile number uniqueness (NEW — same as create)
    if (req.body.mobile_number && req.body.mobile_number !== entity.mobile_number) {
      const existingMobile = await models.Customer.findOne({
        where: {
          mobile_number: req.body.mobile_number,
          deleted_at: null,
          id: { [Op.ne]: entity.id }, // exclude current customer
        },
      });

      if (existingMobile) {
        return commonService.badRequest(res, {
          message: "Mobile number already exists",
        });
      }
    }

    const up = {
      customer_code: req.body.customer_code ?? entity.customer_code,
      customer_name: req.body.customer_name ?? entity.customer_name,
      mobile_number: req.body.mobile_number ?? entity.mobile_number,
      address: req.body.address ?? entity.address,
      country_id: req.body.country_id !== undefined ? +req.body.country_id : entity.country_id,
      state_id: req.body.state_id !== undefined ? +req.body.state_id : entity.state_id,
      district_id: req.body.district_id !== undefined ? +req.body.district_id : entity.district_id,
      pin_code: req.body.pin_code ?? entity.pin_code,
      pan_no: req.body.pan_no ?? entity.pan_no,
      gst_no: req.body.gst_no ?? entity.gst_no,
      email_id: req.body.email_id ?? (entity.email_id || null),
      is_online: req.body.is_online !== undefined ? Boolean(req.body.is_online) : entity.is_online,
      branch_id: req.body.branch_id !== undefined ? (+req.body.branch_id || null) : entity.branch_id,
    };
    await entity.update(up);
    return commonService.okResponse(res, { customer: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteCustomer = async (req, res) => {
  const entity = await commonService.findById(models.Customer, req.params.id, res);
  if (!entity) return;
  try {
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Generate auto code: CUS-0001
const generateCustomerCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Customer,
      "customer_code",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { customer_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateOnlineCustomerCode = async () => {
  const code = await generateFiscalSeriesCode(
    models.Customer,
    "customer_code",
    "COD",
    { pad: 3 }
  );
  return code;
};
// Dropdown: customer names and mobile numbers
const listCustomerMobilesDropdown = async (req, res) => {
  try {
    const rows = await models.Customer.findAll({
      attributes: ['id', 'customer_name', 'mobile_number'],
      order: [["customer_name", "ASC"]],
      where: {
        deleted_at: null,
        mobile_number: { [Op.ne]: null }
      },
    });

    const mobiles = rows
      .map((r) => ({
        id: r.id,
        customer_name: r.customer_name || '',
        mobile: r.mobile_number,
      }))
      .filter(item => item.mobile);

    return commonService.okResponse(res, { mobiles });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Dropdown: customer name + mobile with light search - billing section
const listCustomerNameMobileDropdown = async (req, res) => {
  try {
    const { search = "", branch_id } = req.query;

    const searchTerm = String(search).trim();

    let whereClause = "";
    const replacements = {};

    if (searchTerm) {
      whereClause = `
        AND (
          c.customer_name ILIKE :search OR
          c.mobile_number ILIKE :search OR
          c.customer_code ILIKE :search
        )
      `;
      replacements.search = `%${searchTerm}%`;
    }

    if (branch_id) {
      whereClause += " AND c.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    const query = `
      SELECT 
        c.id,
        c.customer_name,
        c.mobile_number,
        c.address,
        c.pin_code,
        c.customer_code,
        c.pan_no,
        c.gst_no,
        co.country_name,
        s.state_name,
        d.district_name
      FROM customers c
      INNER JOIN countries co  ON co.id = c.country_id  AND co.deleted_at IS NULL
      INNER JOIN states s      ON s.id = c.state_id     AND s.deleted_at IS NULL
      INNER JOIN districts d   ON d.id = c.district_id  AND d.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
        ${whereClause}
      ORDER BY c.customer_name ASC
    `;

    const customers = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
      raw: true
    });

    // Clean & safe output
    const formatted = customers.map(c => ({
      id: c.id,
      customer_name: c.customer_name || "",
      mobile_number: c.mobile_number || "",
      customer_code: c.customer_code || null,
      pan_no: c.pan_no || null,
      gst_no: c.gst_no || null,
      address: c.address || "",
      pin_code: c.pin_code || "",
      country_name: c.country_name || "",
      state_name: c.state_name || "",
      district_name: c.district_name || "",
    }));

    return commonService.okResponse(res, { customers: formatted });

  } catch (err) {
    console.error("listCustomerNameMobileDropdown error:", err);
    return commonService.handleError(res, err);
  }
};

// List Customer Page
const listCustomers = async (req, res) => {
  try {
    const { search, mode, branch_id } = req.query || {};

    let sql = `
      SELECT 
        c.id,
        c.customer_code AS customer_no,
        c.customer_name,
        c.mobile_number,
        COUNT(DISTINCT sib.id) AS no_of_orders,
        c.created_at,

        -- Most recent order type
        (
          SELECT sib2.order_type 
          FROM sales_invoice_bills sib2 
          WHERE sib2.customer_id = c.id 
            AND sib2.deleted_at IS NULL
            AND sib2.is_active = true
            ${mode ? 'AND sib2.order_type = :mode' : ''}
            ${branch_id ? 'AND sib2.branch_id = :branch_id' : ''}
          ORDER BY sib2.created_at DESC 
          LIMIT 1
        ) AS mode,

        -- Most recent branch_id (prefer recent invoice, fallback to customer's branch_id)
        COALESCE(
          (
            SELECT sib2.branch_id
            FROM sales_invoice_bills sib2
            WHERE sib2.customer_id = c.id
              AND sib2.deleted_at IS NULL
              AND sib2.is_active = true
              ${branch_id ? 'AND sib2.branch_id = :branch_id' : ''}
            ORDER BY sib2.created_at DESC
            LIMIT 1
          ),
          (SELECT c2.branch_id FROM customers c2 WHERE c2.id = c.id)
        ) AS branch_id,

        -- Most recent branch name (for display) with fallback to customer's branch
        COALESCE(
          (
            SELECT b.branch_name
            FROM sales_invoice_bills sib2
            LEFT JOIN branches b ON b.id = sib2.branch_id
            WHERE sib2.customer_id = c.id
              AND sib2.deleted_at IS NULL
              AND sib2.is_active = true
              ${branch_id ? 'AND sib2.branch_id = :branch_id' : ''}
            ORDER BY sib2.created_at DESC
            LIMIT 1
          ),
          (SELECT b2.branch_name FROM branches b2 WHERE b2.id = (SELECT c3.branch_id FROM customers c3 WHERE c3.id = c.id))
        ) AS branch,

        -- Total purchase amount
        COALESCE((
          SELECT SUM(total_amount)
          FROM sales_invoice_bills sib3
          WHERE sib3.customer_id = c.id
            AND sib3.deleted_at IS NULL
            AND sib3.is_active = true
            ${branch_id ? 'AND sib3.branch_id = :branch_id' : ''}
        ), 0) AS purchase_amount,

        -- Has active scheme
        EXISTS (
          SELECT 1 
          FROM customer_enrollments e 
          WHERE e.customer_id = c.id 
            AND e.deleted_at IS NULL
        ) AS has_scheme

      FROM customers c

      LEFT JOIN sales_invoice_bills sib 
        ON sib.customer_id = c.id 
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
        ${branch_id ? 'AND sib.branch_id = :branch_id' : ''}

      WHERE c.deleted_at IS NULL
    `;

    const replacements = {};

    // 🔍 Search Filter
    if (search) {
      sql += ` AND (
        c.customer_name ILIKE :search OR 
        c.mobile_number ILIKE :search OR
        c.customer_code ILIKE :search
      )`;
      replacements.search = `%${search}%`;
    }

    // 🎯 Mode Filter
    if (mode) {
      sql += ` AND EXISTS (
        SELECT 1 
        FROM sales_invoice_bills sib4
        WHERE sib4.customer_id = c.id
          AND sib4.order_type = :mode
          AND sib4.deleted_at IS NULL
          AND sib4.is_active = true
      )`;
      replacements.mode = mode;
    }

    // 🏢 Branch ID Filter
    if (branch_id) {
      sql += ` AND (
        c.branch_id = :branch_id
        OR EXISTS (
          SELECT 1
          FROM sales_invoice_bills sib5
          WHERE sib5.customer_id = c.id
            AND sib5.branch_id = :branch_id
            AND sib5.deleted_at IS NULL
            AND sib5.is_active = true
        )
      )`;
      replacements.branch_id = parseInt(branch_id, 10);
    }

    sql += `
      GROUP BY c.id
      ORDER BY c.customer_name ASC
    `;

    const customers = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const formattedCustomers = customers.map(customer => ({
      id: customer.id,
      customer_no: customer.customer_no,
      customer_name: customer.customer_name,
      mobile_number: customer.mobile_number,
      no_of_orders: parseInt(customer.no_of_orders, 10),
      mode: customer.mode || null,
      branch_id: customer.branch_id || null,   // ✅ Added in response
      branch: customer.branch || null,
      purchase_amount: parseFloat(customer.purchase_amount || 0).toFixed(2),
      scheme_details: customer.has_scheme ? 'Yes' : 'No',
      created_at: customer.created_at
    }));

    return commonService.okResponse(res, { customers: formattedCustomers });

  } catch (error) {
    console.error('Error in listCustomers:', error);
    return commonService.handleError(res, error);
  }
};

// Get top buying customers ranked by total invoice value across all branches (or specific branch)
const getTopBuyingCustomers = async (req, res) => {
  try {
    const { limit = 10, branch_id } = req.query;

    // Build WHERE clause for branch filter
    let branchFilter = '';
    const replacements = { limit: parseInt(limit, 10) };

    if (branch_id) {
      branchFilter = 'AND sib.branch_id = :branch_id';
      replacements.branch_id = parseInt(branch_id, 10);
    }

    const query = `
      SELECT 
        c.id AS customer_id,
        c.customer_code,
        c.customer_name,
        c.mobile_number,
        COALESCE(SUM(sib.total_amount), 0) AS total_amount,
        COUNT(sib.id) AS total_invoices
      FROM 
        customers c
      LEFT JOIN 
        sales_invoice_bills sib ON sib.customer_id = c.id 
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${branchFilter}
      WHERE 
        c.deleted_at IS NULL
      GROUP BY 
        c.id, c.customer_code, c.customer_name, c.mobile_number
      HAVING 
        COALESCE(SUM(sib.total_amount), 0) > 0
      ORDER BY 
        total_amount DESC
      LIMIT :limit
    `;

    const topCustomers = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedCustomers = topCustomers.map(customer => ({
      customer_id: customer.customer_id,
      customer_code: customer.customer_code,
      customer_name: customer.customer_name,
      mobile_number: customer.mobile_number,
      total_amount: parseFloat(customer.total_amount || 0).toFixed(2),
      total_invoices: parseInt(customer.total_invoices, 10),
    }));

    return commonService.okResponse(res, {
      top_buying_customers: formattedCustomers
    });
  } catch (err) {
    console.error('Error in getTopBuyingCustomers:', err);
    return commonService.handleError(res, err);
  }
};

// Get the customer enrolled scheme details
const getCustomerSchemes = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const rows = await sequelize.query(
      `
      SELECT
        ce.id AS enrollment_id,
        ce.customer_id,
        ce.scheme_plan_id,
        s.scheme_code,
        s.scheme_name
      FROM customer_enrollments ce
      JOIN schemes s 
        ON s.id = ce.scheme_plan_id
        AND s.deleted_at IS NULL
      WHERE ce.customer_id = :customer_id
      AND ce.deleted_at IS NULL
      AND ce.status = 'Active'
      `,
      {
        replacements: { customer_id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    return commonService.okResponse(res, {
      schemes: rows
    });

  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createCustomer,
  listCustomersWithMobileNumber,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  generateCustomerCode,
  listCustomerMobilesDropdown,
  listCustomerNameMobileDropdown,
  listCustomers,
  generateOnlineCustomerCode,
  getTopBuyingCustomers,
  getCustomerSchemes
};
