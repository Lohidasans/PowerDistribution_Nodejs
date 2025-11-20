const { models } = require("../models/index");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

// Create Bank Account
const createBankAccount = async (req, res) => {
  try {
    const { entity_type, entity_id, ...rest } = req.body;
    const { account_holder_name, bank_name, ifsc_code, account_number } = rest;

    if (!entity_type || !entity_id || !account_holder_name || !bank_name || !ifsc_code || !account_number) {
      return commonService.badRequest(res, message.requiredEntityIdAndType);
    }

    const row = await models.BankAccount.create({entity_type, entity_id, ...rest});

    return commonService.createdResponse(res, { bankAccount: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List Bank Accounts with optional filters
const listBankAccounts = async (req, res) => {
  try {
    const { entity_type, entity_id, search = "" } = req.query;
    const where = {};
    if (entity_type) where.entity_type = entity_type;
    if (entity_id) where.entity_id = entity_id;
   
    const searchCondition = buildSearchCondition(search, ["account_holder_name", "bank_name", "ifsc_code", "account_number", "bank_branch_name"]);
    if (searchCondition) {
      Object.assign(where, searchCondition);
    }

    const items = await models.BankAccount.findAll({ where, order: [["created_at", "DESC"]] });
    return commonService.okResponse(res, { bankAccounts: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get one
const getBankAccountById = async (req, res) => {
  try {
    const row = await commonService.findById(models.BankAccount, req.params.id, res);
    if (!row) return;
    return commonService.okResponse(res, { bankAccount: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update
const updateBankAccount = async (req, res) => {
  try {
    const row = await commonService.findById(models.BankAccount, req.params.id, res);
    if (!row) return;
    await row.update(req.body);
    return commonService.okResponse(res, { bankAccount: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteBankAccount = async (req, res) => {
  try {
    const row = await commonService.findById(models.BankAccount, req.params.id, res);
    if (!row) return;
    await row.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createBankAccount,
  listBankAccounts,
  getBankAccountById,
  updateBankAccount,
  deleteBankAccount,
  createBankAccountByEntity: async (transaction, entity_type, entity_id, data) => {
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) 
      return null;
    
    const exists = await models.BankAccount.findOne({ where: { entity_type, entity_id }, transaction });
    if (exists) throw new Error("BANK_ACCOUNT_ALREADY_EXISTS");
  
    return models.BankAccount.create({ ...data, entity_type, entity_id }, { transaction });
  },
  updateBankAccountByEntity: async (transaction, entity_type, entity_id, data) => {
    if (!data || typeof data !== "object") return null;
    const existing = await models.BankAccount.findOne({ where: { entity_type, entity_id }, transaction });
    if (!existing) return null; // no create on update-only path
    await existing.update(
      {
        account_holder_name: data.account_holder_name ?? existing.account_holder_name,
        bank_name: data.bank_name ?? existing.bank_name,
        ifsc_code: data.ifsc_code ?? existing.ifsc_code,
        account_number: data.account_number ?? existing.account_number,
        bank_branch_name: data.bank_branch_name ?? existing.bank_branch_name,
      },
      { transaction }
    );
    return existing;
  },
};
