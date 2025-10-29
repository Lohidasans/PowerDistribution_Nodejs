const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

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
      customer_code: req.body.customer_code ?? null,
      customer_name: req.body.customer_name,
      mobile_number: req.body.mobile_number,
      address: req.body.address,
      country_id: +req.body.country_id,
      state_id: +req.body.state_id,
      district_id: +req.body.district_id,
      pin_code: req.body.pin_code,
    };

    const customer = await models.Customer.create(payload);
    return commonService.createdResponse(res, { customer });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List customers (simple filters)
const listCustomers = async (req, res) => {
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
      const { prefix, fy } = req.query || {};
  
      if (!prefix || !fy) {
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
  
      const code = await generateFiscalSeriesCode(
        models.Customer,
        "customer_code",
        String(prefix).toUpperCase(),
        { pad: 2, fyRange: fy }
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

module.exports = {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  generateCustomerCode,
  listCustomerMobilesDropdown,
};
