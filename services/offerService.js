const { models,  } = require("../models");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

const createOffer = async (req, res) => {
  try {
    const { 
      offer_code,
      offer_plan_id,
      offer_description,
      offer_type,
      offer_value,
      valid_from,
      valid_to,
      applicable_type_id,
      status = "Active"
    } = req.body;

    // Required field validation
    if (!offer_code || !offer_plan_id || !offer_type || !offer_value || !valid_from || !valid_to || !applicable_type_id) {
      return commonService.badRequest(res, enMessage.common.requiredFields);
    }

    // Check if offer code already exists (only among non-deleted records)
    const existingOffer = await models.Offer.findOne({
      where: {
        offer_code: offer_code,
        deleted_at: null,
      },
      paranoid: false,
    });

    if (existingOffer) {
      return commonService.badRequest(
        res,
        enMessage.offer.alreadyExists
      );
    }

    // Validate date range
    if (new Date(valid_from) >= new Date(valid_to)) {
      return commonService.badRequest(res, "Valid To date must be after Valid From date");
    }

    const offerData = {
      offer_code,
      offer_plan_id,
      offer_description,
      offer_type,
      offer_value,
      valid_from,
      valid_to,
      applicable_type_id,
      status
    };

    const row = await models.Offer.create(offerData);
    
    return commonService.createdResponse(res, { offer: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listOffers = async (req, res) => {
  try {
    const {
      search = "",
      status,
      offer_plan_id
    } = req.query;

    const where = {
      deleted_at: null
    };

    const searchCondition = buildSearchCondition(search, [
      "offer_code",
      "offer_description",
    ]);

    if (searchCondition) {
      Object.assign(where, searchCondition);
    }

    if (status && ["Active", "Inactive"].includes(status)) {
      where.status = status;
    }

    if (offer_plan_id) {
      where.offer_plan_id = offer_plan_id;
    }

    const offers = await models.Offer.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    const [totalCount, activeCount, inactiveCount] = await Promise.all([
      models.Offer.count({
        where: { deleted_at: null }
      }),
      models.Offer.count({
        where: { deleted_at: null, status: "Active" }
      }),
      models.Offer.count({
        where: { deleted_at: null, status: "Inactive" }
      })
    ]);

    return commonService.okResponse(res, {
      counts: {
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount
      },
      offers
    });
  } catch (err) {
    console.error("List Offers Error:", err);
    return commonService.handleError(res, err);
  }
};

const getOfferById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await models.Offer.findOne({
      where: { id, deleted_at: null },
      paranoid: false
    });
    
    if (!entity) {
      return commonService.notFound(res, enMessage.offer.notFound);
    }
    
    return commonService.okResponse(res, { offer: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      offer_code,
      offer_plan_id,
      offer_description,
      offer_type,
      offer_value,
      valid_from,
      valid_to,
      applicable_type_id,
      status
    } = req.body;

    // Find the offer
    const entity = await models.Offer.findByPk(id, { paranoid: false });
    
    if (!entity || entity.deleted_at) {
      return commonService.notFound(res, enMessage.offer.notFound);
    }

    // Unique offer_code check (case-insensitive, only if changing)
    if (offer_code !== undefined) {
      const trimmedNewCode = offer_code.trim();

      if (trimmedNewCode !== (entity.offer_code || '').trim()) {
        const existingOffer = await models.Offer.findOne({
          where: {
            offer_code: { [Op.iLike]: trimmedNewCode },
            id: { [Op.ne]: id },
            deleted_at: null,
          },
        });

        if (existingOffer) {
          return commonService.badRequest(res, enMessage.offer.alreadyExists);
        }
      }
    }

    // Validate date range if either date is being updated
    if ((valid_from || valid_to) && 
        new Date(valid_from || entity.valid_from) >= new Date(valid_to || entity.valid_to)) {
      return commonService.badRequest(res, "Valid To date must be after Valid From date");
    }

    // Only update fields that are provided in the request
    const updateData = {};
    const fields = [
      'offer_code', 'offer_plan_id', 'offer_description', 'offer_type',
      'offer_value', 'valid_from', 'valid_to', 'applicable_type_id', 'status'
    ];
    
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    await entity.update(updateData);
    
    const updatedOffer = await models.Offer.findByPk(id);
    
    return commonService.okResponse(res, { offer: updatedOffer });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await models.Offer.findByPk(id);
    
    if (!entity) {
      return commonService.notFound(res, enMessage.offer.notFound);
    }
    
    await entity.destroy();
    
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// For dropdown/list selection
const listOffersDropdown = async (req, res) => {
  try {
    const { status = 'Active' } = req.query;
    
    const where = {
      deleted_at: null
    };
    
    if (status) {
      where.status = status;
    }
    
    const items = await models.Offer.findAll({
      attributes: [
        'id',
        'offer_code',
        'offer_plan_id',
        'offer_type',
        'offer_value',
        'valid_from',
        'valid_to',
        'applicable_type_id',
        'status'
      ],
      where,
      order: [['offer_code', 'ASC']]
    });
    
    return commonService.okResponse(res, { offers: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateOfferCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Offer,
      "offer_code",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { offer_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};
module.exports = {
  createOffer,
  listOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
  listOffersDropdown,
  generateOfferCode
};
