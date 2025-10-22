const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");

const createCountry = async (req, res) => {
  try {
    const {
      country_name,
      short_name,
      currency_symbol,
      country_code,
      country_image_url,
    } = req.body;

    if (!country_name || !short_name || !currency_symbol) {
      return commonService.badRequest(res, message.country?.required);
    }

    const existingCountry = await models.Country.findOne({
      where: { country_name },
    });
    if (existingCountry) {
      return commonService.badRequest(res, message.country?.duplicate);
    }

    const country = await models.Country.create({
      country_name,
      short_name,
      currency_symbol,
      country_code,
      country_image_url,
    });

    return commonService.createdResponse(res, {
      country,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getAllCountries = async (req, res) => {
  try {
    const { search } = req.query;

    let query = `
      SELECT
        c.id,
        c.country_name,
        c.short_name,
        c.currency_symbol,
        c.country_code,
        c.country_image_url
      FROM countries c
      WHERE c.deleted_at IS NULL
    `;

    const replacements = {};

    // Search filter
    if (search) {
      const searchableFields = [
        "c.country_name",
        "c.short_name",
        "c.currency_symbol",
        "c.country_code",
      ];
      query += ` AND (${searchableFields
        .map((f) => `${f} ILIKE :search`)
        .join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    query += ` ORDER BY c.country_name ASC`;

    const [countries] = await sequelize.query(query, { replacements });

    return commonService.okResponse(res, { countries });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listCountriesDropdown = async (req, res) => {
  try {
    const countries = await models.Country.findAll({
      attributes: ["id", "country_name"],
      where: { deleted_at: null },
      order: [["country_name", "ASC"]],
    });

    return commonService.okResponse(res, { countries });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getCountryById = async (req, res) => {
  try {
    const { id } = req.params;
    const country = await models.Country.findByPk(id);

    if (!country) {
      return commonService.notFound(res, message.country?.notFound);
    }

    return commonService.okResponse(res, { country });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateCountry = async (req, res) => {
  const entity = await commonService.findById(
    models.Country,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    await entity.update(req.body);
    return commonService.okResponse(res, { country: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const country = await models.countries.findByPk(id);

    if (!country) {
      return commonService.notFound(res, message.country?.notFound);
    }

    await country.destroy();

    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createCountry,
  getAllCountries,
  listCountriesDropdown,
  getCountryById,
  updateCountry,
  deleteCountry,
};
