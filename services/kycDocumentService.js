const { models } = require("../models/index");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

// Create KYC Document
const createKycDocument = async (req, res) => {
  try {
    const { entity_type, entity_id, doc_type, doc_number } = req.body;

    if (!entity_type || !entity_id || !doc_type) {
      return commonService.badRequest(res, message.requiredEntityIdAndType);
    }

    const row = await models.KycDocument.create({ entity_type, entity_id, doc_type, doc_number });

    return commonService.createdResponse(res, { kycDocument: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List KYC Documents with optional filters
const listKycDocuments = async (req, res) => {
  try {
    const { entity_type, entity_id, search = "" } = req.query;
    const where = {};
    if (entity_type) where.entity_type = entity_type;
    if (entity_id) where.entity_id = entity_id;

    const searchCondition = buildSearchCondition(search, ["doc_type", "doc_number"]);
    if (searchCondition) {
      Object.assign(where, searchCondition);
    }

    const items = await models.KycDocument.findAll({ where, order: [["created_at", "DESC"]] });
    return commonService.okResponse(res, { kycDocuments: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get one
const getKycDocumentById = async (req, res) => {
  try {
    const row = await commonService.findById(models.KycDocument, req.params.id, res);
    if (!row) return;
    return commonService.okResponse(res, { kycDocument: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update
const updateKycDocument = async (req, res) => {
  try {
    const row = await commonService.findById(models.KycDocument, req.params.id, res);
    if (!row) return;
    await row.update(req.body);
    return commonService.okResponse(res, { kycDocument: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteKycDocument = async (req, res) => {
  try {
    const row = await commonService.findById(models.KycDocument, req.params.id, res);
    if (!row) return;
    await row.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createKycDocument,
  listKycDocuments,
  getKycDocumentById,
  updateKycDocument,
  deleteKycDocument,
};
