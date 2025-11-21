const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");

const createState = async (req, res) => {
  try {
    const { states } = req.body;

    if (!states || !Array.isArray(states) || states.length === 0) {
      return commonService.badRequest(res, message.state?.arrayRequired);
    }

    for (const state of states) {
      if (!state.country_id || !state.state_code || !state.state_name) {
        return commonService.badRequest(res, message.state?.required);
      }
    }

    const result = await models.State.bulkCreate(states, { validate: true });

    return commonService.createdResponse(res, { States: result });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List all states with optional search and country filter
const getAllStates = async (req, res) => {
  try {
    const { search, country_id } = req.query;

    let query = `
      SELECT
        s.id,
        s.country_id,
        s.state_code,
        s.state_name,
        c.country_name,
        c.short_name AS country_short_name
      FROM states s
      LEFT JOIN countries c ON c.id = s.country_id
      WHERE s.deleted_at IS NULL
    `;

    const replacements = {};

    if (country_id) {
      query += ` AND s.country_id = :country_id`;
      replacements.country_id = country_id;
    }

    if (search) {
      const searchableFields = [
        "s.state_code",
        "s.state_name",
        "c.country_name",
      ];
      query += ` AND (${searchableFields
        .map((f) => `${f} ILIKE :search`)
        .join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    query += ` ORDER BY s.state_name ASC`;

    const [states] = await sequelize.query(query, { replacements });

    return commonService.okResponse(res, { states });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listStatesDropdown = async (req, res) => {
  try {
    const { country_id } = req.query;
    const where = { deleted_at: null };
    if (country_id) where.country_id = country_id;

    const states = await models.State.findAll({
      attributes: ["id", "state_name"],
      where,
      order: [["state_name", "ASC"]],
    });

    return commonService.okResponse(res, { states });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get state by ID
const getStateById = async (req, res) => {
  const entity = await commonService.findById(models.State, req.params.id, res);
  if (!entity) return;
  return commonService.okResponse(res, { state: entity });
};

// Update state by ID
const updateState = async (req, res) => {
  const entity = await commonService.findById(models.State, req.params.id, res);
  if (!entity) return;

  try {
    const { country_id, state_code, state_name } = req.body;

    if (country_id) {
      const country = await models.Country.findByPk(country_id);
      if (!country) {
        return commonService.badRequest(res, message.country?.notFound);
      }
    }

    await entity.update({ country_id, state_code, state_name });
    return commonService.okResponse(res, { state: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Soft delete state by ID
const deleteState = async (req, res) => {
  const entity = await commonService.findById(models.State, req.params.id, res);
  if (!entity) return;

  try {
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createState,
  getAllStates,
  listStatesDropdown,
  getStateById,
  updateState,
  deleteState,
};
