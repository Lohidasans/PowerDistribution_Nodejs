const { models } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

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

// Get all enrollments (basic filters)
const listEnrollments = async (req, res) => {
  try {
    const { mobile_number, status } = req.query || {};
    const where = {};
    if (mobile_number) where.mobile_number = String(mobile_number);
    if (status) where.status = status;

    const rows = await models.Enrollment.findAll({
      where,
      order: [["created_at", "DESC"]],
    });
    return commonService.okResponse(res, { enrollments: rows });
  } catch (err) {
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

module.exports = {
  createEnrollment,
  listEnrollments,
  getEnrollmentById,
};
