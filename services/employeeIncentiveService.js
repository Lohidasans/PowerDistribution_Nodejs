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

module.exports = {
  createIncentive,
  listIncentives,
  getIncentiveById,
  updateIncentive,
  deleteIncentive,
};
