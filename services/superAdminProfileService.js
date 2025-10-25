const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");

const createSuperAdminProfile = async (req, res) => {
  try {
    const {
      company_name,
      proprietor,
      mobile_number,
      email_id,
      address,
      district_id,
      state_id,
      pin_code,
      branch_sequence_type,
      branch_sequence_value,
      joining_date,
    } = req.body;

    if (
      !company_name ||
      !proprietor ||
      !mobile_number ||
      !email_id ||
      !address ||
      !district_id ||
      !state_id ||
      !pin_code ||
      !branch_sequence_type ||
      !branch_sequence_value ||
      !joining_date
    ) {
      return commonService.badRequest(res, message.superAdminProfile?.required);
    }

    const profile = await models.SuperAdminProfile.create({
      company_name,
      proprietor,
      mobile_number,
      email_id,
      address,
      district_id,
      state_id,
      pin_code,
      branch_sequence_type,
      branch_sequence_value,
      joining_date,
    });

    return commonService.createdResponse(res, { profile });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listSuperAdminProfiles = async (req, res) => {
  try {
    const { state_id, district_id, search } = req.query;

    let query = `
      SELECT 
        sap.id,
        sap.company_name,
        sap.proprietor,
        sap.mobile_number,
        sap.email_id,
        sap.address,
        sap.district_id,
        sap.state_id,
        sap.pin_code,
        sap.branch_sequence_type,
        sap.branch_sequence_value,
        sap.joining_date,
        s.state_name,
        d.district_name
      FROM superadmin_profiles sap
      LEFT JOIN states s ON s.id = sap.state_id
      LEFT JOIN districts d ON d.id = sap.district_id
      WHERE sap.deleted_at IS NULL
    `;

    const replacements = {};

    if (state_id) {
      query += ` AND sap.state_id = :state_id`;
      replacements.state_id = Number(state_id);
    }

    if (district_id) {
      query += ` AND sap.district_id = :district_id`;
      replacements.district_id = Number(district_id);
    }

    if (search) {
      const searchableFields = [
        "sap.company_name",
        "sap.proprietor",
        "sap.mobile_number",
        "sap.email_id",
        "CAST(sap.branch_sequence_value AS TEXT)",
      ];
      query += ` AND (${searchableFields
        .map((f) => `${f} ILIKE :search`)
        .join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    query += ` ORDER BY sap.id ASC`;

    console.log("Query:", query);
    console.log("Replacements:", replacements);

    const profiles = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    if (!profiles.length) {
      return commonService.notFound(res, message.failure.notFound);
    }

    return commonService.okResponse(res, { profiles });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listSuperAdminDropdown = async (req, res) => {
  try {
    const { state_id, district_id } = req.query;

    const where = { deleted_at: null };

    if (state_id) where.state_id = Number(state_id);
    if (district_id) where.district_id = Number(district_id);

    const profiles = await models.SuperAdminProfile.findAll({
      attributes: ["id", "company_name"],
      where,
      order: [["company_name", "ASC"]],
    });

    if (!profiles.length) {
      return commonService.notFound(res, message.failure.notFound);
    }

    return commonService.okResponse(res, { profiles });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


const getSuperAdminProfileById = async (req, res) => {
  const entity = await commonService.findById(
    models.SuperAdminProfile,
    req.params.id,
    res
  );
  if (!entity) return;
  return commonService.okResponse(res, { profile: entity });
};

const updateSuperAdminProfile = async (req, res) => {
  const entity = await commonService.findById(
    models.SuperAdminProfile,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    const {
      company_name,
      proprietor,
      mobile_number,
      email_id,
      address,
      district_id,
      state_id,
      pin_code,
      branch_sequence_type,
      branch_sequence_value,
      joining_date,
    } = req.body;

    await entity.update({
      company_name,
      proprietor,
      mobile_number,
      email_id,
      address,
      district_id,
      state_id,
      pin_code,
      branch_sequence_type,
      branch_sequence_value,
      joining_date,
    });

    return commonService.okResponse(res, { profile: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteSuperAdminProfile = async (req, res) => {
  const entity = await commonService.findById(
    models.SuperAdminProfile,
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
  createSuperAdminProfile,
  listSuperAdminProfiles,
  listSuperAdminDropdown,
  getSuperAdminProfileById,
  updateSuperAdminProfile,
  deleteSuperAdminProfile,
};
