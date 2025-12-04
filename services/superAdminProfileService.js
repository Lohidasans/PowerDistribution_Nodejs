const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const bankSvc = require("./bankAccountService");
const kycSvc = require("./kycDocumentService");
const userSvc = require("./userLoginService");

const createSuperAdminProfile = async (req, res) => {
  const t = await sequelize.transaction();
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
      bank_account,
      kyc_documents,
      logins,
    } = req.body || {};

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
      await t.rollback();
      return commonService.badRequest(res, message.superAdminProfile?.required || message.failure.requiredFields);
    }

    const profile = await models.SuperAdminProfile.create(
      {
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
      },
      { transaction: t }
    );

    // Optional: single bank account via helper
    let createdBankAccount = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        createdBankAccount = await bankSvc.createBankAccountByEntity(t, "superadmin", profile.id, bank_account);
      } catch (e) {
        await t.rollback();
        return commonService.badRequest(res, message.requiredEntityIdAndType);
      }
    }

    // Optional: multiple KYC via helper
    let createdKycDocs = [];
    if (Array.isArray(kyc_documents) && kyc_documents.length > 0) {
      createdKycDocs = await kycSvc.createKycByEntity(t, "superadmin", profile.id, kyc_documents);
    }

    // Optional: multiple logins via helper (array)
    let createdUsers = [];
    if (logins && !Array.isArray(logins)) {
      await t.rollback();
      return commonService.badRequest(res, message.failure.badRequest);
    }
    if (Array.isArray(logins) && logins.length > 0) {
      const result = await userSvc.createUsersByEntity(t, "superadmin", profile.id, logins);
      if (result.error) {
        await t.rollback();
        return commonService.badRequest(res, result.error);
      }
      createdUsers = result.users || [];
    }

    await t.commit();
    return commonService.createdResponse(res, {
      profile,
      bank_account: createdBankAccount,
      kyc_documents: createdKycDocs,
      logins: createdUsers,
    });
  } catch (err) {
    await t.rollback();
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
  try {
    const { id } = req.params;
    const profile = await commonService.findById(models.SuperAdminProfile, id, res);
    if (!profile) return;

    const [bank_account, kyc_documents, logins] = await Promise.all([
      models.BankAccount.findOne({ where: { entity_type: "superadmin", entity_id: id } }),
      models.KycDocument.findAll({ where: { entity_type: "superadmin", entity_id: id } }),
      models.User.findAll({ where: { entity_type: "superadmin", entity_id: id } }),
    ]);

    return commonService.okResponse(res, { profile, bank_account, kyc_documents, logins });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateSuperAdminProfile = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const entity = await commonService.findById(models.SuperAdminProfile, id, res);
    if (!entity) {
      await t.rollback();
      return;
    }

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
      bank_account,
      kyc_documents,
      logins,
    } = req.body || {};

    await entity.update(
      {
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
      },
      { transaction: t }
    );

    // Update-only bank account
    let upsertedBank = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        upsertedBank = await bankSvc.updateBankAccountByEntity(t, "superadmin", entity.id, bank_account);
      } catch (e) {
        await t.rollback();
        return commonService.handleError(res, e);
      }
    }

    // KYC update-only
    let updatedKyc = [];
    if (Array.isArray(kyc_documents)) {
      updatedKyc = await kycSvc.updateKycByEntity(t, "superadmin", entity.id, kyc_documents);
    }

    // Logins update-only (array required if provided)
    let updatedLogins = [];
    if (logins !== undefined) {
      if (!Array.isArray(logins)) {
        await t.rollback();
        return commonService.badRequest(res, message.failure.badRequest);
      }
      updatedLogins = await userSvc.updateUsersByEntity(t, "superadmin", entity.id, logins);
    }

    await t.commit();
    return commonService.okResponse(res, {
      profile: entity,
      bank_account: upsertedBank,
      kyc_documents: updatedKyc,
      logins: updatedLogins,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const deleteSuperAdminProfile = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const entity = await commonService.findById(models.SuperAdminProfile, req.params.id, res);
    if (!entity) {
      await t.rollback();
      return;
    }

    // Delete ancillary records
    await models.BankAccount.destroy({ where: { entity_type: "superadmin", entity_id: entity.id }, transaction: t });
    await models.KycDocument.destroy({ where: { entity_type: "superadmin", entity_id: entity.id }, transaction: t });
    await models.User.destroy({ where: { entity_type: "superadmin", entity_id: entity.id }, transaction: t });

    await entity.destroy({ transaction: t });
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
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
