const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

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

  scheme_type_id:
    req.body.scheme_type_id !== undefined
      ? +req.body.scheme_type_id
      : existing?.scheme_type_id,

  duration_id:
    req.body.duration_id !== undefined
      ? +req.body.duration_id
      : existing?.duration_id,

  monthly_installments: Array.isArray(req.body.monthly_installments)
    ? req.body.monthly_installments.map((n) => +n)
    : existing?.monthly_installments ?? null,

  payment_frequency_id:
    req.body.payment_frequency_id !== undefined
      ? +req.body.payment_frequency_id
      : existing?.payment_frequency_id,

  min_amount:
    req.body.min_amount !== undefined
      ? +req.body.min_amount
      : existing?.min_amount ?? null,

  redemption_id:
    req.body.redemption_id !== undefined
      ? +req.body.redemption_id
      : existing?.redemption_id,

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
      "scheme_type_id",
      "duration_id",
      "payment_frequency_id",
      "redemption_id",
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

/** List Schemes with filters (joined with master names) */
const listSchemes = async (req, res) => {
  try {
    const { material_type_id, scheme_type_id, status, duration_id, payment_frequency_id, redemption_id, scheme_code } = req.query;

    let query = `
      SELECT
        s.*,
        mt.material_type,
        st.type_name AS scheme_type_name,
        sd.duration_name,
        pf.frequency_name,
        rt.type_name AS redemption_type_name
      FROM schemes s
      LEFT JOIN "materialTypes" mt ON mt.id = s.material_type_id AND mt.deleted_at IS NULL
      LEFT JOIN scheme_types st ON st.id = s.scheme_type_id AND st.deleted_at IS NULL
      LEFT JOIN scheme_durations sd ON sd.id = s.duration_id AND sd.deleted_at IS NULL
      LEFT JOIN payment_frequencies pf ON pf.id = s.payment_frequency_id AND pf.deleted_at IS NULL
      LEFT JOIN redemption_types rt ON rt.id = s.redemption_id AND rt.deleted_at IS NULL
      WHERE s.deleted_at IS NULL`;

    const replacements = {};
    if (material_type_id)
    {
      query += ` AND s.material_type_id = :material_type_id`;
      replacements.material_type_id = +material_type_id;
    }
    if (scheme_type_id) {
      query += ` AND s.scheme_type_id = :scheme_type_id`;
      replacements.scheme_type_id = +scheme_type_id;
    }
    if (duration_id) {
      query += ` AND s.duration_id = :duration_id`;
      replacements.duration_id = +duration_id;
    }
    if (payment_frequency_id) {
      query += ` AND s.payment_frequency_id = :payment_frequency_id`;
      replacements.payment_frequency_id = +payment_frequency_id;
    }
    if (redemption_id) {
      query += ` AND s.redemption_id = :redemption_id`;
      replacements.redemption_id = +redemption_id;
    }
    if (status) {
      query += ` AND s.status = :status`;
      replacements.status = status;
    }
    if (scheme_code) {
      query += ` AND s.scheme_code = :scheme_code`;
      replacements.scheme_code = scheme_code;
    }

    query += ` ORDER BY s.created_at DESC`;

    const [schemes] = await sequelize.query(query, { replacements });

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

// Dropdowns
const listSchemeTypes = async (_req, res) => {
  try {
    const rows = await models.SchemeType.findAll({
      order: [["type_name", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, name: r.type_name }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listSchemeDurations = async (_req, res) => {
  try {
    const rows = await models.SchemeDuration.findAll({
      order: [["duration_name", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, name: r.duration_name }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listPaymentFrequencies = async (_req, res) => {
  try {
    const rows = await models.PaymentFrequency.findAll({
      order: [["frequency_name", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, name: r.frequency_name }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listRedemptionTypes = async (_req, res) => {
  try {
    const rows = await models.RedemptionType.findAll({
      order: [["type_name", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, name: r.type_name }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listIdentityProofs = async (_req, res) => {
  try {
    const rows = await models.IdentityProof.findAll({
      order: [["proof_name", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, name: r.proof_name }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listNomineeRelations = async (_req, res) => {
  try {
    const rows = await models.NomineeRelation.findAll({
      order: [["relation_name", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, name: r.relation_name }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Installment amounts dropdown by scheme_id
const listInstallmentAmounts = async (req, res) => {
  try {
    const { scheme_id } = req.query || {};
    if (!scheme_id) return commonService.badRequest(res, enMessage.failure.requiredFields);

    const scheme = await models.Scheme.findByPk(+scheme_id);
    if (!scheme) return commonService.notFound(res, enMessage.failure.notFound);

    const amounts = Array.isArray(scheme.monthly_installments)
      ? scheme.monthly_installments.map((a) => +a)
      : [];

    return commonService.okResponse(res, { installments: amounts });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listSchemeNumbers = async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return commonService.badRequest(res, "customer_id is required");
    }

    const [rows] = await sequelize.query(
      `
      SELECT s.id, s.scheme_name, s.scheme_code
      FROM schemes s
      INNER JOIN customer_enrollments ce
        ON ce.scheme_plan_id = s.id
      WHERE ce.customer_id = :customer_id
      ORDER BY s.scheme_name ASC
      `,
      {
        replacements: { customer_id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    return commonService.okResponse(res, { scheme_data: rows });

  } catch (err) {
    return commonService.handleError(res, err);
  }
};


const generateSchemeCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Scheme,
      "scheme_code",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { scheme_code: code });
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
  listSchemeTypes,
  listSchemeDurations,
  listPaymentFrequencies,
  listRedemptionTypes,
  listIdentityProofs,
  listNomineeRelations,
  listInstallmentAmounts,
  generateSchemeCode,
  listSchemeNumbers

};