const { models } = require("../models/index");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

// Create multiple KYC Documents (Bulk)
const createKycDocuments = async (req, res) => {
  try {
    const { documents } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return commonService.badRequest(res, message.kyc.arrayRequired);
    }

    // Validate each document
    for (const doc of documents) {
      if (!doc.entity_type || !doc.entity_id || !doc.doc_type) {
        return commonService.badRequest(res, message.requiredEntityIdAndType);
      }
    }

    // Bulk insert
    const rows = await models.KycDocument.bulkCreate(documents, { returning: true });

    return commonService.createdResponse(res, { kycDocuments: rows });
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

// Update KYC Documents by entity_id
const updateKycDocumentsByEntity = async (req, res) => {
  try {
    const { entity_type, entity_id, documents } = req.body;

    if (!entity_type || !entity_id) {
      return commonService.badRequest(res, message.requiredEntityIdAndType);
    }

    if (!Array.isArray(documents) || documents.length === 0) {
      return commonService.badRequest(res, message.kyc.arrayRequired);
    }

    const updatedDocuments = [];

    for (const doc of documents) {
      if (!doc.id) {
        return commonService.badRequest(res, message.kyc.includeId);
      }

      // Update specific document using primary key and entity info
      const [affectedRows] = await models.KycDocument.update(
        {
          doc_type: doc.doc_type,
          doc_number: doc.doc_number,
          file_url: doc.file_url,
        },
        {
          where: {
            id: doc.id,
            entity_id: entity_id,
            entity_type: entity_type,
          },
        }
      );

      if (affectedRows > 0) {
        // Optionally, fetch the updated row if needed
        const updatedDoc = await models.KycDocument.findByPk(doc.id);
        if (updatedDoc) {
          updatedDocuments.push(updatedDoc);
        }
      }
    }

    return commonService.okResponse(res, { kycDocuments: updatedDocuments });
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
  createKycDocuments,
  listKycDocuments,
  getKycDocumentById,
  updateKycDocumentsByEntity,
  deleteKycDocument,
};
