const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require("sequelize");

// Create customer
const createCustomer = async (req, res) => {
  try {
    const required = ["customer_name", "mobile_number" ];
    for (const f of required) {
      if (req.body?.[f] === undefined || req.body?.[f] === null || req.body?.[f] === "") {
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
    }

    const payload = {
      customer_code: req.body.customer_code,
      customer_name: req.body.customer_name,
      mobile_number: req.body.mobile_number,
      // Optional fields
      email_id: req.body.email_id || null,
      address: req.body.address || null,
      country_id: +req.body.country_id || null,
      state_id: +req.body.state_id || null,
      district_id: +req.body.district_id || null,
      pin_code: req.body.pin_code || null,
      pan_no: req.body.pan_no || null,
    };

    // Check duplicate mobile number (ACTIVE customers only)
    const existingMobile = await models.Customer.findOne({
      where: {
        mobile_number: payload.mobile_number,
        deleted_at: null,
      },
    });

    if (existingMobile) {
      return commonService.badRequest(res, {
        message: "Mobile number already exists",
      });
    }
    
    // Check if a non-deleted customer already uses this code
    if (payload.customer_code) {
      const existing = await models.Customer.findOne({
        where: {
          customer_code: payload.customer_code,
          deleted_at: null,     // only check active (non-deleted) records
        },
      });

      if (existing) {
        return commonService.badRequest(res, {
          message: "Customer code already exists",
        });
      }
    }


    const customer = await models.Customer.create(payload);
    return commonService.createdResponse(res, { customer });
  } catch (err) {
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

// Dropdown: distinct customer mobile numbers
const listCustomerMobilesDropdown = async (req, res) => {
  try {
    const rows = await models.Customer.findAll({
      attributes: [[sequelize.fn("DISTINCT", sequelize.col("mobile_number")), "mobile_number"]],
      order: [["mobile_number", "ASC"]],
      where: { deleted_at: null },
    });

    const mobiles = rows
      .map((r, index) => ({
        id: index + 1,
        mobile: r.mobile_number ?? r.get("mobile_number"),
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
    const { search = "" } = req.query;

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

    const query = `
      SELECT 
        c.id,
        c.customer_name,
        c.mobile_number,
        c.address,
        c.pin_code,
        c.customer_code,
        c.pan_no,
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
    const { search, mode, branch_name } = req.query || {};

    // Build the base query
    let sql = `
      SELECT 
        c.id,
        c.customer_code AS customer_no,
        c.customer_name,
        c.mobile_number,
        COUNT(DISTINCT sib.id) AS no_of_orders,
        c.created_at,
        -- Get the most recent order type as the mode
        (
          SELECT sib2.order_type 
          FROM sales_invoice_bills sib2 
          WHERE sib2.customer_id = c.id 
          AND sib2.deleted_at IS NULL
          ${mode ? 'AND sib2.order_type = :mode' : ''}
          ORDER BY sib2.created_at DESC 
          LIMIT 1
        ) AS mode,
        -- Get the most recent branch
        (
          SELECT b.branch_name 
          FROM sales_invoice_bills sib2
          LEFT JOIN branches b ON b.id = sib2.branch_id
          WHERE sib2.customer_id = c.id 
          AND sib2.deleted_at IS NULL
          ${branch_name ? 'AND b.branch_name = :branch_name' : ''}
          ORDER BY sib2.created_at DESC 
          LIMIT 1
        ) AS branch,
        -- Total purchase amount
        COALESCE((
          SELECT SUM(total_amount)
          FROM sales_invoice_bills sib3
          WHERE sib3.customer_id = c.id
          AND sib3.deleted_at IS NULL
        ), 0) AS purchase_amount,
        -- Check if customer has any active enrollment
        EXISTS (
          SELECT 1 
          FROM customer_enrollments e 
          WHERE e.customer_id = c.id 
          AND e.deleted_at IS NULL
        ) AS has_scheme
      FROM 
        customers c
      LEFT JOIN 
        sales_invoice_bills sib ON sib.customer_id = c.id AND sib.deleted_at IS NULL
      LEFT JOIN 
        branches b ON b.id = sib.branch_id
      WHERE 
        c.deleted_at IS NULL
    `;

    const replacements = {};

    // Add search condition if search term exists
    if (search) {
      sql += ` AND (
        c.customer_name ILIKE :search OR 
        c.mobile_number ILIKE :search OR
        c.customer_code ILIKE :search OR
        b.branch_name ILIKE :search
      )`;
      replacements.search = `%${search}%`;
    }

    // Add mode filter if provided
    if (mode) {
      sql += ` AND EXISTS (
        SELECT 1 
        FROM sales_invoice_bills sib4
        WHERE sib4.customer_id = c.id
        AND sib4.order_type = :mode
        AND sib4.deleted_at IS NULL
      )`;
      replacements.mode = mode;
    }

    // Add branch filter if provided
    if (branch_name) {
      sql += ` AND EXISTS (
        SELECT 1 
        FROM sales_invoice_bills sib5
        JOIN branches b2 ON b2.id = sib5.branch_id
        WHERE sib5.customer_id = c.id
        AND b2.branch_name = :branch_name
        AND sib5.deleted_at IS NULL
      )`;
      replacements.branch_name = branch_name;
    }

    // Add GROUP BY and ORDER BY
    sql += `
      GROUP BY 
        c.id
      ORDER BY 
        c.customer_name ASC
    `;

    // Execute the query
    const customers = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Format the response
    const formattedCustomers = customers.map(customer => ({
      id: customer.id,
      customer_no: customer.customer_no,
      customer_name: customer.customer_name,
      mobile_number: customer.mobile_number,
      no_of_orders: parseInt(customer.no_of_orders, 10),
      mode: customer.mode || null,
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


module.exports = {
  createCustomer,
  listCustomersWithMobileNumber,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  generateCustomerCode,
  listCustomerMobilesDropdown,
  listCustomerNameMobileDropdown,
  listCustomers
};
