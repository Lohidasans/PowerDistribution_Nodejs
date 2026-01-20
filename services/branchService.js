const { models, sequelize } = require("../models/index");
const message = require("../constants/en.json");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const { buildSearchCondition } = require("../helpers/queryHelper");
const { generateUniqueCode } = require("../helpers/codeGeneration");
const kycSvc = require("./kycDocumentService");
const bankSvc = require("./bankAccountService");
const userSvc = require("./userLoginService");

// Helper function to create default invoice settings for a branch
const createDefaultInvoiceSettings = async (transaction, branchId) => {
  try {
    // Get all active invoice setting enums
    const invoiceSettingEnums = await models.InvoiceSettingEnum.findAll({
      where: { status: "Active" },
      attributes: ["id"],
      transaction,
    });

    if (invoiceSettingEnums.length === 0) {
      console.warn("No active invoice setting enums found");
      return [];
    }

    // Create invoice settings for each enum
    const invoiceSettingsData = invoiceSettingEnums.map((enumItem) => ({
      branch_id: branchId,
      invoice_sequence_name_id: enumItem.id,
      invoice_prefix: null,
      invoice_suffix: null,
      invoice_start_no: null,
      status_id: 1,
    }));

    const createdInvoiceSettings = await models.InvoiceSetting.bulkCreate(
      invoiceSettingsData,
      { transaction }
    );

    return createdInvoiceSettings;
  } catch (error) {
    console.error("Error creating default invoice settings:", error);
    throw error;
  }
};

// Create a new Branch (with optional bank account, KYC docs, login)
const createBranch = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { bank_account, kyc_documents, login, ...branchInput } =
      req.body || {};

    const { branch_name } = branchInput;

    // Validate required fields
    if (!branch_name) {
      await t.rollback();
      return commonService.badRequest(res, message.branch.required);
    }

    // Generate branch_no BEFORE create (to satisfy NOT NULL): COMPANY_PREFIX + DISTRICT_SHORT + sequence (e.g., CJ_CHEN_01)
    const superAdmin = await models.SuperAdminProfile.findOne({ order: [["id", "ASC"]], transaction: t });
    if (!superAdmin?.branch_sequence_value) {
      await t.rollback();
      return commonService.badRequest(res, "Company code not configured in Super Admin Profile");
    }

    const district = await models.District.findByPk(branchInput.district_id, { transaction: t });
    if (!district?.short_name) {
      await t.rollback();
      return commonService.badRequest(res, "District short code not found");
    }

    const companyCode = String(superAdmin.branch_sequence_value).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const districtCode = String(district.short_name).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const generatedBranchNo = await generateUniqueCode(
      models.Branch,
      "branch_no",
      [companyCode, districtCode],
      { pad: 2, separator: "_" }
    );
    const branch = await models.Branch.create({ ...branchInput, branch_no: generatedBranchNo }, { transaction: t });

    // Optionally create a single bank account via reusable create helper
    let createdBankAccount = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        createdBankAccount = await bankSvc.createBankAccountByEntity(
          t,
          "branch",
          branch.id,
          bank_account
        );
      } catch (e) {
        await t.rollback();
        return commonService.badRequest(res, message.requiredEntityIdAndType);
      }
    }

    // Optionally create multiple KYC docs via reusable create helper
    let createdKycDocs = [];
    if (Array.isArray(kyc_documents) && kyc_documents.length > 0) {
      createdKycDocs = await kycSvc.createKycByEntity(
        t,
        "branch",
        branch.id,
        kyc_documents
      );
    }

    // Optionally create login via reusable create helper
    let createdUser = null;
    if (login && typeof login === "object" && Object.keys(login).length > 0) {
      const result = await userSvc.createUserByEntity(
        t,
        "branch",
        branch.id,
        login
      );

      if (result.error) {
        await t.rollback();
        return commonService.badRequest(res, result.error);
      }
      createdUser = result.user;
    }


    // Create default invoice settings for the branch
    let createdInvoiceSettings = [];
    try {
      createdInvoiceSettings = await createDefaultInvoiceSettings(t, branch.id);
    } catch (e) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "Failed to create default invoice settings"
      );
    }

    await t.commit();

    // Compose response
    return commonService.createdResponse(res, {
      branch,
      bank_account: createdBankAccount,
      kyc_documents: createdKycDocs,
      login: createdUser,
      invoice_settings: createdInvoiceSettings,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// List branches with optional search and status filter using raw SQL joins
const listBranches = async (req, res) => {
  try {
    const searchKey = req.query.search || "";
    const status = req.query.status || "";
    const state_id = req.query.state_id || "";
    const district_id = req.query.district_id || "";

    // Build where conditions
    const whereConditions = ["b.deleted_at IS NULL"];
    const replacements = {};

    // Add search condition
    if (searchKey) {
      whereConditions.push(`(
        b.branch_no ILIKE :search OR 
        b.branch_name ILIKE :search OR 
        b.contact_person ILIKE :search OR
        d.district_name ILIKE :search OR
        s.state_name ILIKE :search 
        --OR
        --c.country_name ILIKE :search
      )`);
      replacements.search = `%${searchKey}%`;
    }

    // Add filters
    if (status) {
      whereConditions.push("b.status = :status");
      replacements.status = status;
    }
    if (state_id) {
      whereConditions.push("b.state_id = :state_id");
      replacements.state_id = state_id;
    }
    if (district_id) {
      whereConditions.push("b.district_id = :district_id");
      replacements.district_id = district_id;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Main query with joins
    const query = `
      SELECT 
        b.*,
        d.district_name,
        s.state_name
        --c.country_name
      FROM branches b
      LEFT JOIN districts d ON d.id = b.district_id
      LEFT JOIN states s ON s.id = b.state_id
      --LEFT JOIN countries c ON c.id = b.country_id
      ${whereClause}
      ORDER BY b.created_at DESC
    `;

    // Execute raw query
    const branches = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
      model: models.Branch,
      mapToModel: true
    });

    return commonService.okResponse(res, { branches });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get a single branch by ID with nested entities
const getBranchById = async (req, res) => {
  try {
    const id = req.params.id;
    const branch = await commonService.findById(models.Branch, id, res);
    if (!branch) return;

    const [bank_account, kyc_documents, login, invoice_settings] =
      await Promise.all([
        models.BankAccount.findOne({
          where: { entity_type: "branch", entity_id: id },
        }),
        models.KycDocument.findAll({
          where: { entity_type: "branch", entity_id: id },
        }),
        models.User.findOne({
          where: { entity_type: "branch", entity_id: id },
        }),
        models.InvoiceSetting.findAll({
          where: { branch_id: id },
        }),
      ]);

    // Get invoice setting enum details for each invoice setting
    if (invoice_settings && invoice_settings.length > 0) {
      for (let setting of invoice_settings) {
        const enumDetail = await models.InvoiceSettingEnum.findByPk(
          setting.invoice_sequence_name_id,
          { attributes: ["id", "invoice_setting_enum"] }
        );
        setting.dataValues.invoice_setting_enum_detail = enumDetail;
      }
    }

    return commonService.okResponse(res, {
      branch,
      bank_account,
      kyc_documents,
      login,
      invoice_settings,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update a branch (with optional upserts for bank account, KYC docs, login)
const updateBranch = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const branch = await commonService.findById(models.Branch, id, res);
    if (!branch) {
      await t.rollback();
      return;
    }

    const { bank_account, kyc_documents, login, ...branchInput } =
      req.body || {};

    // Unique check if branch_no changed
    if (branchInput.branch_no && branchInput.branch_no !== branch.branch_no) {
      const exists = await models.Branch.findOne({
        where: { branch_no: branchInput.branch_no, id: { [Op.ne]: id } },
      });
      if (exists) {
        await t.rollback();
        return commonService.badRequest(res, message.branch.duplicateNo);
      }
    }

    await branch.update(branchInput, { transaction: t });

    // Update-only bank account via reusable update helper (no create on update)
    let upsertedBankAccount = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        upsertedBankAccount = await bankSvc.updateBankAccountByEntity(
          t,
          "branch",
          branch.id,
          bank_account
        );
      } catch (e) {
        await t.rollback();
        return commonService.handleError(res, e);
      }
    }

    // KYC via reusable update helper (update-only)
    let updatedKyc = [];
    if (Array.isArray(kyc_documents)) {
      updatedKyc = await kycSvc.updateKycByEntity(
        t,
        "branch",
        branch.id,
        kyc_documents
      );
    }

    // Update-only login via reusable update helper (no create on update)
    let upsertedUser = null;
    if (login && typeof login === "object") {
      try {
        upsertedUser = await userSvc.updateUserByEntity(
          t,
          "branch",
          branch.id,
          login
        );
      } catch (e) {
        await t.rollback();
        return commonService.handleError(res, e);
      }
    }

    await t.commit();
    return commonService.okResponse(res, {
      branch,
      bank_account: upsertedBankAccount,
      kyc_documents: updatedKyc,
      login: upsertedUser,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Soft delete a branch and its related ancillary records
const deleteBranch = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const branch = await commonService.findById(models.Branch, id, res);
    if (!branch) {
      await t.rollback();
      return;
    }

    // Delete ancillary records tied via entity_type/entity_id
    await models.BankAccount.destroy({
      where: { entity_type: "branch", entity_id: id },
      transaction: t,
    });
    await models.KycDocument.destroy({
      where: { entity_type: "branch", entity_id: id },
      transaction: t,
    });
    await models.User.destroy({
      where: { entity_type: "branch", entity_id: id },
      transaction: t,
    });

    // Delete invoice settings for this branch
    await models.InvoiceSetting.destroy({
      where: { branch_id: id },
      transaction: t,
    });

    // Soft delete branch
    await branch.destroy({ transaction: t });

    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const branchDropdownList = async (req, res) => {
  try {
    const rows = await models.Branch.findAll({
      attributes: ["id", "branch_name", "branch_no"], // Only the fields needed for dropdown
      order: [["branch_name", "ASC"]],
    });

    return commonService.okResponse(res, { branches: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateBranchCode = async (req, res) => {
  try {
    const { company_code, location_code } = req.query || {};

    // Validate query params
    if (!company_code || !location_code) {
      return commonService.badRequest(res, message.branch.requiredCodes);
    }

    const branchCode = await generateUniqueCode(
      models.Branch,
      "branch_no",
      [company_code, location_code],
      { pad: 3, separator: "_" }
    );

    return commonService.okResponse(res, { branch_code: branchCode });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
};
