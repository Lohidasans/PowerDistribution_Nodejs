const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

const createOfferApplicableType = async (req, res) => {
  try {
    const { type_name } = req.body;

    // Required field validation
    if (!type_name) {
      return commonService.badRequest(res, enMessage.common.requiredFields);
    }

    // Check if type name already exists (only among non-deleted records)
    const existingType = await models.OfferApplicableType.findOne({
      where: {
        type_name: type_name,
        deleted_at: null,
      },
      paranoid: false,
    });

    if (existingType) {
      return commonService.badRequest(
        res,
        enMessage.offerApplicableType.alreadyExists
      );
    }

    const row = await models.OfferApplicableType.create({ type_name });
    
    return commonService.createdResponse(res, { applicableType: row });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return commonService.badRequest(res, enMessage.offerApplicableType.duplication);
    }
    return commonService.handleError(res, err);
  }
};

const listOfferApplicableTypes = async (req, res) => {
  try {
    const { search = "" } = req.query;
    const where = {
      deleted_at: null
    };
    
    const searchCondition = buildSearchCondition(search, ["type_name"]);
    
    if (searchCondition) Object.assign(where, searchCondition);

    const items = await models.OfferApplicableType.findAll({
      where,
      order: [["created_at", "DESC"]],
    });
    
    return commonService.okResponse(res, { applicableTypes: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getOfferApplicableTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await models.OfferApplicableType.findOne({
      where: { id, deleted_at: null },
      paranoid: false
    });
    
    if (!entity) {
      return commonService.notFound(res, enMessage.offerApplicableType.notFound);
    }
    
    return commonService.okResponse(res, { applicableType: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateOfferApplicableType = async (req, res) => {
  try {
    const { id } = req.params;
    const { type_name } = req.body;

    // Find the applicable type
    const entity = await models.OfferApplicableType.findByPk(id, { paranoid: false });
    
    if (!entity || entity.deleted_at) {
      return commonService.notFound(res, enMessage.offerApplicableType.notFound);
    }

    // Check if type_name is being updated and if it already exists in another record
    if (type_name && type_name !== entity.type_name) {
      const existingType = await models.OfferApplicableType.findOne({
        where: {
          type_name,
          id: { [Op.ne]: id },
          deleted_at: null,
        },
        paranoid: false,
      });

      if (existingType) {
        return commonService.badRequest(
          res,
          enMessage.offerApplicableType.alreadyExists
        );
      }
    }

    await entity.update({ type_name });
    
    return commonService.okResponse(res, { applicableType: entity });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return commonService.badRequest(res, enMessage.offerApplicableType.duplication);
    }
    return commonService.handleError(res, err);
  }
};

const deleteOfferApplicableType = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await models.OfferApplicableType.findByPk(id);
    
    if (!entity) {
      return commonService.notFound(res, enMessage.offerApplicableType.notFound);
    }
    
    await entity.destroy();
    
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// For dropdown/list selection
const listApplicableTypesDropdown = async (req, res) => {
  try {
    const items = await models.OfferApplicableType.findAll({
      attributes: ['id', 'type_name'],
      where: {
        deleted_at: null
      },
      order: [['type_name', 'ASC']]
    });
    
    return commonService.okResponse(res, { applicableTypes: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createOfferApplicableType,
  listOfferApplicableTypes,
  getOfferApplicableTypeById,
  updateOfferApplicableType,
  deleteOfferApplicableType,
  listApplicableTypesDropdown
};
