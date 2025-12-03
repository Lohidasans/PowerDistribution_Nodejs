const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require("sequelize");

// Create customer
const createCustomer = async (req, res) => {
  try {
    const required = [
      "customer_name",
      "mobile_number",
      "address",
      "country_id",
      "state_id",
      "district_id",
      "pin_code",
    ];
    for (const f of required) {
      if (req.body?.[f] === undefined || req.body?.[f] === null || req.body?.[f] === "") {
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
    }

    const payload = {
      customer_code: req.body.customer_code,
      customer_name: req.body.customer_name,
      mobile_number: req.body.mobile_number,
      address: req.body.address,
      country_id: +req.body.country_id,
      state_id: +req.body.state_id,
      district_id: +req.body.district_id,
      pin_code: req.body.pin_code,
    };
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
    const up = {
      customer_code: req.body.customer_code ?? entity.customer_code,
      customer_name: req.body.customer_name ?? entity.customer_name,
      mobile_number: req.body.mobile_number ?? entity.mobile_number,
      address: req.body.address ?? entity.address,
      country_id: req.body.country_id !== undefined ? +req.body.country_id : entity.country_id,
      state_id: req.body.state_id !== undefined ? +req.body.state_id : entity.state_id,
      district_id: req.body.district_id !== undefined ? +req.body.district_id : entity.district_id,
      pin_code: req.body.pin_code ?? entity.pin_code,
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
// const listCustomers = async (req, res) => {

// };

module.exports = {
  createCustomer,
  listCustomersWithMobileNumber,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  generateCustomerCode,
  listCustomerMobilesDropdown,
  listCustomerNameMobileDropdown,
  //listCustomers
};
