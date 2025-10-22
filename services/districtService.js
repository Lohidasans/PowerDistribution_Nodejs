const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");

const createDistrict = async (req, res) => {
  try {
    const { districts } = req.body;

    if (!Array.isArray(districts) || districts.length === 0) {
      return commonService.badRequest(res, message.district.arrayRequired);
    }
      
    for (const d of districts) {
      if (!d.country_id || !d.state_id || !d.short_name || !d.district_name) {
        return commonService.badRequest(res, message.district.required);
      }
    }

    // Bulk insert
    const created = await models.District.bulkCreate(districts, {
      returning: true,
    });

    return commonService.createdResponse(res, { districts: created });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getAllDistricts = async (req, res) => {
  try {
    const { search, country_id, state_id } = req.query;

    let query = `
      SELECT
        d.id,
        d.country_id,
        d.state_id,
        d.short_name,
        d.district_name,
        c.country_name,
        s.state_name
      FROM districts d
      LEFT JOIN countries c ON c.id = d.country_id
      LEFT JOIN states s ON s.id = d.state_id
      WHERE d.deleted_at IS NULL
    `;
    const replacements = {};

    if (country_id) {
      query += ` AND d.country_id = :country_id`;
      replacements.country_id = country_id;
    }

    if (state_id) {
      query += ` AND d.state_id = :state_id`;
      replacements.state_id = state_id;
    }

    if (search) {
      const fields = [
        "d.short_name",
        "d.district_name",
        "s.state_name",
        "c.country_name",
      ];
      query += ` AND (${fields.map((f) => `${f} ILIKE :search`).join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    query += ` ORDER BY d.district_name ASC`;

    const [districts] = await sequelize.query(query, { replacements });

    return commonService.okResponse(res, { districts });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listDistrictsDropdown = async (req, res) => {
  try {
    const { country_id, state_id } = req.query;
    const where = { deleted_at: null };
    if (country_id) where.country_id = country_id;
    if (state_id) where.state_id = state_id;

    const districts = await models.District.findAll({
      attributes: ["id", "district_name"],
      where,
      order: [["district_name", "ASC"]],
    });

    return commonService.okResponse(res, { districts });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getDistrictById = async (req, res) => {
  const entity = await commonService.findById(
    models.District,
    req.params.id,
    res
  );
  if (!entity) return;
  return commonService.okResponse(res, { district: entity });
};

const updateDistrict = async (req, res) => {
  const entity = await commonService.findById(
    models.District,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    const { country_id, state_id } = req.body;

    if (country_id) {
      const country = await models.Country.findByPk(country_id);
      if (!country) {
        return commonService.badRequest(res, message.district.notfound);
      }
    }

    if (state_id) {
      const state = await models.State.findByPk(state_id);
      if (!state) {
        return commonService.badRequest(res, message.district.notfound);
      }
    }

    await entity.update(req.body);
    return commonService.okResponse(res, { district: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteDistrict = async (req, res) => {
  const entity = await commonService.findById(
    models.District,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createDistrict,
  getAllDistricts,
  listDistrictsDropdown,
  getDistrictById,
  updateDistrict,
  deleteDistrict,
};
