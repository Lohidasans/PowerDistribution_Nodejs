const { models, sequelize } = require("../models/index");
const message = require("../constants/en.json");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const { buildSearchCondition } = require("../helpers/queryHelper");
const generateAutoCode = require("../helpers/codeGeneration");
const kycSvc = require("./kycDocumentService");
const bankSvc = require("./bankAccountService");
const userSvc = require("./userLoginService");

// Create a new Branch (with optional bank account, KYC docs, login)
const createBranch = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { bank_account, kyc_documents, login, ...branchInput } = req.body || {};

    const { branch_no, branch_name } = branchInput;

    // Validate required fields
    if (!branch_no || !branch_name) {
      await t.rollback();
      return commonService.badRequest(res, message.branch.required);
    }

    // Enforce unique branch_no
    const existing = await models.Branch.findOne({ where: { branch_no } });
    if (existing) {
      await t.rollback();
      return commonService.badRequest(res, message.branch.duplicateNo);
    }

    // Create branch
    const branch = await models.Branch.create(branchInput, { transaction: t });

    // Optionally create a single bank account via reusable create helper
    let createdBankAccount = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        createdBankAccount = await bankSvc.createBankAccountByEntity(t, "branch", branch.id, bank_account);
      } catch (e) {
        await t.rollback();
        return commonService.badRequest(res, message.requiredEntityIdAndType);
      }
    }

    // Optionally create multiple KYC docs via reusable create helper
    let createdKycDocs = [];
    if (Array.isArray(kyc_documents) && kyc_documents.length > 0) {
      createdKycDocs = await kycSvc.createKycByEntity(t, "branch", branch.id, kyc_documents);
    }

    // Optionally create login via reusable create helper
    let createdUser = null;
    if (login && typeof login === "object") {
      try {
        createdUser = await userSvc.createUserByEntity(t, "branch", branch.id, login);
      } catch (e) {
        await t.rollback();
        return commonService.badRequest(res, message.failure.requiredFields);
      }
    }

    await t.commit();

    // Compose response
    return commonService.createdResponse(res, {
      branch,
      bank_account: createdBankAccount,
      kyc_documents: createdKycDocs,
      login: createdUser,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// List branches with optional search and status filter
const listBranches = async (req, res) => {
    try {
        const searchKey = req.query.search || "";
        const status = req.query.status || "";
        const state_id = req.query.state_id || "";
        const district_id = req.query.district_id || "";

        const where = {};
        // Add search condition
        const searchCondition = buildSearchCondition(searchKey, ["branch_no", "branch_name", "contact_person"]);
        if (searchCondition) {
            Object.assign(where, searchCondition);
        }
        // Add filters
        if (status) where.status = status;
        if (state_id) where.state_id = state_id;
        if (district_id) where.district_id = district_id;

        const branches = await models.Branch.findAll({ where, order: [["created_at", "DESC"]], });
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

    const [bank_account, kyc_documents, login] = await Promise.all([
      models.BankAccount.findOne({ where: { entity_type: "branch", entity_id: id } }),
      models.KycDocument.findAll({ where: { entity_type: "branch", entity_id: id } }),
      models.User.findOne({ where: { entity_type: "branch", entity_id: id } }),
    ]);

    return commonService.okResponse(res, { branch, bank_account, kyc_documents, login });
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

    const { bank_account, kyc_documents, login, ...branchInput } = req.body || {};

    // Unique check if branch_no changed
    if (branchInput.branch_no && branchInput.branch_no !== branch.branch_no) {
      const exists = await models.Branch.findOne({ where: { branch_no: branchInput.branch_no, id: { [Op.ne]: id } } });
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
        upsertedBankAccount = await bankSvc.updateBankAccountByEntity(t, "branch", branch.id, bank_account);
      } catch (e) {
        await t.rollback();
        return commonService.handleError(res, e);
      }
    }

    // KYC via reusable update helper (update-only)
    let updatedKyc = [];
    if (Array.isArray(kyc_documents)) {
      updatedKyc = await kycSvc.updateKycByEntity(t, "branch", branch.id, kyc_documents);
    }

    // Update-only login via reusable update helper (no create on update)
    let upsertedUser = null;
    if (login && typeof login === "object") {
      try {
        upsertedUser = await userSvc.updateUserByEntity(t, "branch", branch.id, login);
      } catch (e) {
        await t.rollback();
        return commonService.handleError(res, e);
      }
    }

    await t.commit();
    return commonService.okResponse(res, { branch, bank_account: upsertedBankAccount, kyc_documents: updatedKyc, login: upsertedUser });
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
    await models.BankAccount.destroy({ where: { entity_type: "branch", entity_id: id }, transaction: t });
    await models.KycDocument.destroy({ where: { entity_type: "branch", entity_id: id }, transaction: t });
    await models.User.destroy({ where: { entity_type: "branch", entity_id: id }, transaction: t });

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
            attributes: ["id", "branch_name"], // Only the fields needed for dropdown
            order: [["branch_name", "ASC"]],
        });

        return commonService.okResponse(res, { branches: rows });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

const generateBranchCode = async (req, res) => {
    try {
        const code = await generateAutoCode(models.Branch, "branch_no", "BR");
        return commonService.okResponse(res, { branch_code: code });
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
  generateBranchCode
};
