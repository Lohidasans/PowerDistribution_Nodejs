const { models } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

/** Utility: Validates required fields */
const validateRequiredFields = (req, res, fields) => {
  for (const field of fields) {
    const value = req.body?.[field];
    if (value === undefined || value === null || value === "") {
      commonService.badRequest(res, enMessage.failure.requiredFields);
      return false;
    }
  }
  return true;
};

/** Utility: Builds payload for create/update */
const buildSchemePayload = (req, existing = null) => ({
  material_type_id:
    req.body.material_type_id !== undefined
      ? +req.body.material_type_id
      : existing?.material_type_id,

  scheme_name: req.body.scheme_name ?? existing?.scheme_name,
  scheme_type: req.body.scheme_type ?? existing?.scheme_type,
  duration: req.body.duration ?? existing?.duration, // ENUM string

  monthly_installments: Array.isArray(req.body.monthly_installments)
    ? req.body.monthly_installments.map((n) => +n)
    : existing?.monthly_installments ?? null,

  payment_frequency: req.body.payment_frequency ?? existing?.payment_frequency,
  min_amount:
    req.body.min_amount !== undefined
      ? +req.body.min_amount
      : existing?.min_amount ?? null,

  redemption: req.body.redemption ?? existing?.redemption,

  visible_to: Array.isArray(req.body.visible_to)
    ? req.body.visible_to.map((id) => +id)
    : existing?.visible_to ?? null,

  status: req.body.status ?? existing?.status ?? "Active",
  terms_and_conditions_url:
    req.body.terms_and_conditions_url ??
    existing?.terms_and_conditions_url ??
    null,
});

/** Create Scheme */
const createScheme = async (req, res) => {
  try {
    const required = [
      "material_type_id",
      "scheme_name",
      "scheme_type",
      "duration",
      "payment_frequency",
      "redemption",
      "terms_and_conditions_url",
    ];
    if (!validateRequiredFields(req, res, required)) return;

    const payload = buildSchemePayload(req);
    const scheme = await models.Scheme.create(payload);

    return commonService.createdResponse(res, { scheme });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

/** List Schemes with filters */
const listSchemes = async (req, res) => {
  try {
    const { material_type_id, scheme_type, status } = req.query;

    const where = {};
    if (material_type_id) where.material_type_id = +material_type_id;
    if (scheme_type) where.scheme_type = scheme_type;
    if (status) where.status = status;

    const schemes = await models.Scheme.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { schemes });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

/** Get Scheme by ID */
const getSchemeById = async (req, res) => {
  const scheme = await commonService.findById(models.Scheme, req.params.id, res);
  if (!scheme) return;
  return commonService.okResponse(res, { scheme });
};

/** Update Scheme */
const updateScheme = async (req, res) => {
  const existing = await commonService.findById(models.Scheme, req.params.id, res);
  if (!existing) return;

  try {
    const updatedData = buildSchemePayload(req, existing);
    await existing.update(updatedData);

    return commonService.okResponse(res, { scheme: existing });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

/** Soft Delete Scheme */
const deleteScheme = async (req, res) => {
  const entity = await commonService.findById(models.Scheme, req.params.id, res);
  if (!entity) return;

  try {
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createScheme,
  listSchemes,
  getSchemeById,
  updateScheme,
  deleteScheme,
};