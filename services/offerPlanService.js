const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

const createOfferPlan = async (req, res) => {
  try {
    const { plan_name } = req.body;

    // Required field validation
    if (!plan_name) {
      return commonService.badRequest(res, enMessage.common.requiredFields);
    }

    // Check if plan name already exists (only among non-deleted records)
    const existingPlan = await models.OfferPlan.findOne({
      where: {
        plan_name: plan_name,
        deleted_at: null,
      },
      paranoid: false,
    });

    if (existingPlan) {
      return commonService.badRequest(
        res,
        enMessage.offerPlan.alreadyExists
      );
    }

    const row = await models.OfferPlan.create({ plan_name });
    
    return commonService.createdResponse(res, { offerPlan: row });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return commonService.badRequest(res, enMessage.offerPlan.duplication);
    }
    return commonService.handleError(res, err);
  }
};

const listOfferPlans = async (req, res) => {
  try {
    const { search = "", status } = req.query;
    const where = {
      deleted_at: null
    };
    
    const searchCondition = buildSearchCondition(search, ["plan_name"]);
    
    if (searchCondition) Object.assign(where, searchCondition);

    const items = await models.OfferPlan.findAll({
      where,
      order: [["created_at", "DESC"]],
    });
    
    return commonService.okResponse(res, { offerPlans: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getOfferPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await models.OfferPlan.findOne({
      where: { id, deleted_at: null },
      paranoid: false
    });
    
    if (!entity) {
      return commonService.notFound(res, enMessage.offerPlan.notFound);
    }
    
    return commonService.okResponse(res, { offerPlan: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateOfferPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan_name } = req.body;

    // Find the offer plan
    const entity = await models.OfferPlan.findByPk(id, { paranoid: false });
    
    if (!entity || entity.deleted_at) {
      return commonService.notFound(res, enMessage.offerPlan.notFound);
    }

    // Check if plan_name is being updated and if it already exists in another record
    if (plan_name && plan_name !== entity.plan_name) {
      const existingPlan = await models.OfferPlan.findOne({
        where: {
          plan_name,
          id: { [Op.ne]: id },
          deleted_at: null,
        },
        paranoid: false,
      });

      if (existingPlan) {
        return commonService.badRequest(
          res,
          enMessage.offerPlan.alreadyExists
        );
      }
    }

    await entity.update({ plan_name });
    
    return commonService.okResponse(res, { offerPlan: entity });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return commonService.badRequest(res, enMessage.offerPlan.duplication);
    }
    return commonService.handleError(res, err);
  }
};

const deleteOfferPlan = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await models.OfferPlan.findByPk(id);
    
    if (!entity) {
      return commonService.notFound(res, enMessage.offerPlan.notFound);
    }
    
    await entity.destroy();
    
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// For dropdown/list selection
const listOfferPlansDropdown = async (req, res) => {
  try {
    const items = await models.OfferPlan.findAll({
      attributes: ['id', 'plan_name'],
      where: {
        deleted_at: null
      },
      order: [['plan_name', 'ASC']]
    });
    
    return commonService.okResponse(res, { offerPlans: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createOfferPlan,
  listOfferPlans,
  getOfferPlanById,
  updateOfferPlan,
  deleteOfferPlan,
  listOfferPlansDropdown
};
