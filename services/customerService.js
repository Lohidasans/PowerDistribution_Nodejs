const { models } = require("../models");
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
    const { search } = req.query;
    const where = {};
    if (search) {
      // basic ILIKE search using sequelize operators
      const { Op } = require("sequelize");
      where[Op.or] = [
        { customer_name: { [Op.iLike]: `%${search}%` } },
        { mobile_number: { [Op.iLike]: `%${search}%` } },
      ];
    }
    const customers = await models.Customer.findAll({ where, order: [["created_at", "DESC"]] });
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

module.exports = {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  generateCustomerCode,
};
