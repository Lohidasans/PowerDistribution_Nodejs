const { models, sequelize } = require("../models");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

const createOffer = async (req, res) => {
  const transaction = await sequelize.transaction();

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
      status = "Active",
      branch_id,
      applicables = []
    } = req.body;

    if (!offer_code || !offer_plan_id || !offer_type || !offer_value || !valid_from || !valid_to || !applicable_type_id) {
      return commonService.badRequest(res, enMessage.common.requiredFields);
    }

    const existingOffer = await models.Offer.findOne({
      where: {
        offer_code,
        deleted_at: null
      },
      paranoid: false
    });

    if (existingOffer) {
      return commonService.badRequest(
        res,
        enMessage.offer.alreadyExists
      );
    }

    if (new Date(valid_from) >= new Date(valid_to)) {
      return commonService.badRequest(res, "Valid To date must be after Valid From date");
    }

    const offer = await models.Offer.create({
      offer_code,
      offer_plan_id,
      offer_description,
      offer_type,
      offer_value,
      valid_from,
      valid_to,
      applicable_type_id,
      status,
      branch_id: branch_id || 1
    }, { transaction });

    /* -------- store applicable mapping ---------- */

    if (Array.isArray(applicables) && applicables.length) {

      const rows = applicables.map(a => ({
        offer_id: offer.id,
        material_type_id: a.material_type_id || null,
        category_id: a.category_id || null,
        subcategory_id: a.subcategory_id || null,
        product_id: a.product_id || null
      }));

      await models.OfferApplicable.bulkCreate(rows, { transaction });
    }

    await transaction.commit();

    return commonService.createdResponse(res, { offer });

  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

const listOffers = async (req, res) => {
  try {
    const {
      search = "",
      status,
      offer_plan_id,
      branch_id
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

    if (branch_id) {
      where.branch_id = branch_id;
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

    // 1️⃣ Get Offer
    const offer = await models.Offer.findOne({
      where: { id, deleted_at: null },
      raw: true
    });

    if (!offer) {
      return commonService.notFound(res, enMessage.offer.notFound);
    }

    // 2️⃣ Get Applicables
    const applicables = await models.OfferApplicable.findAll({
      where: { offer_id: id },
      raw: true
    });

    let materialIds = [];
    let categoryIds = [];
    let subcategoryIds = [];
    let productIds = [];

    applicables.forEach(a => {
      if (a.material_type_id) materialIds.push(a.material_type_id);
      if (a.category_id) categoryIds.push(a.category_id);
      if (a.subcategory_id) subcategoryIds.push(a.subcategory_id);
      if (a.product_id) productIds.push(a.product_id);
    });

    // 3️⃣ Fetch related data
    const [materials, categories, subcategories, products] = await Promise.all([
      materialIds.length
        ? models.MaterialType.findAll({
          where: { id: materialIds },
          attributes: ["id", "material_type"],
          raw: true
        })
        : [],

      categoryIds.length
        ? models.Category.findAll({
          where: { id: categoryIds },
          attributes: ["id", "category_name"],
          raw: true
        })
        : [],

      subcategoryIds.length
        ? models.Subcategory.findAll({
          where: { id: subcategoryIds },
          attributes: ["id", "subcategory_name"],
          raw: true
        })
        : [],

      productIds.length
        ? models.Product.findAll({
          where: { id: productIds },
          attributes: ["id", "product_name", "sku_id"],
          raw: true
        })
        : []
    ]);

    // 4️⃣ Convert to maps
    const materialMap = Object.fromEntries(materials.map(m => [m.id, m]));
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const subcategoryMap = Object.fromEntries(subcategories.map(s => [s.id, s]));
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // 5️⃣ Build response
    const applicableList = applicables.map(a => ({
      id: a.id,
      material_type: materialMap[a.material_type_id]?.material_type || null,
      category: categoryMap[a.category_id]?.category_name || null,
      subcategory: subcategoryMap[a.subcategory_id]?.subcategory_name || null,
      sku_id: productMap[a.product_id]?.sku_id || null,
      product_name: productMap[a.product_id]?.product_name || null
    }));

    return commonService.okResponse(res, {
      offer,
      applicables: applicableList
    });

  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateOffer = async (req, res) => {
  const transaction = await sequelize.transaction();

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
      status,
      applicables = []
    } = req.body;

    const entity = await models.Offer.findByPk(id, { transaction });

    if (!entity) {
      await transaction.rollback();
      return commonService.notFound(res, enMessage.offer.notFound);
    }

    // Unique code validation
    if (offer_code && offer_code !== entity.offer_code) {
      const exists = await models.Offer.findOne({
        where: {
          offer_code: { [Op.iLike]: offer_code },
          id: { [Op.ne]: id },
          deleted_at: null
        }
      });

      if (exists) {
        await transaction.rollback();
        return commonService.badRequest(res, enMessage.offer.alreadyExists);
      }
    }

    // Date validation
    if (
      (valid_from || valid_to) &&
      new Date(valid_from || entity.valid_from) >=
      new Date(valid_to || entity.valid_to)
    ) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "Valid To date must be after Valid From date"
      );
    }

    // Update offer header
    await entity.update(
      {
        offer_code,
        offer_plan_id,
        offer_description,
        offer_type,
        offer_value,
        valid_from,
        valid_to,
        applicable_type_id,
        status
      },
      { transaction }
    );

    const payloadIds = applicables
      .filter(a => a.id)
      .map(a => a.id);

    // DELETE removed applicables
    if (payloadIds.length) {
      await models.OfferApplicable.destroy({
        where: {
          offer_id: id,
          id: { [Op.notIn]: payloadIds }
        },
        transaction
      });
    } else {
      await models.OfferApplicable.destroy({
        where: { offer_id: id },
        transaction
      });
    }

    // UPDATE existing
    for (const item of applicables.filter(a => a.id)) {

      await models.OfferApplicable.update(
        {
          material_type_id: item.material_type_id || null,
          category_id: item.category_id || null,
          subcategory_id: item.subcategory_id || null,
          product_id: item.product_id || null
        },
        {
          where: { id: item.id, offer_id: id },
          transaction
        }
      );

    }

    // CREATE new
    const newItems = applicables.filter(a => !a.id);

    if (newItems.length) {

      const rows = newItems.map(a => ({
        offer_id: id,
        material_type_id: a.material_type_id || null,
        category_id: a.category_id || null,
        subcategory_id: a.subcategory_id || null,
        product_id: a.product_id || null
      }));

      await models.OfferApplicable.bulkCreate(rows, { transaction });

    }

    await transaction.commit();

    return commonService.okResponse(res, {
      message: "Offer updated successfully"
    });

  } catch (err) {
    await transaction.rollback();
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
    const { status = 'Active', branch_id } = req.query;
    
    const where = {
      deleted_at: null
    };
    
    if (status) {
      where.status = status;
    }

    if (branch_id) {
      where.branch_id = branch_id;
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
        'branch_id',
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

const getProducts = async (req, res) => {
  try {

    const query = `
      SELECT 
        p.id,
        p.product_name,
        p.sku_id,
        p.image_urls,
        mt.material_image_url,
        mt.material_type AS material_type,
        mt.id AS material_type_id,
        c.category_image_url,
        c.category_name,
        c.id AS category_id,
        s.subcategory_image_url,
        s.subcategory_name,
        s.id AS subcategory_id
      FROM products p
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN subcategories s ON s.id = p.subcategory_id
      WHERE 
        p.deleted_at IS NULL
        AND p.status = 'Active'
        AND s.deleted_at IS NULL
      ORDER BY p.created_at DESC
    `;

    const result = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    return res.status(200).json({
      status: true,
      message: "Products fetched successfully",
      data: result
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      error: error.message
    });
  }
};

const updateOfferStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return commonService.badRequest(res, "Status is required");
    }

    if (!["Active", "Inactive"].includes(status)) {
      return commonService.badRequest(res, "Invalid status value");
    }

    const offer = await models.Offer.findOne({
      where: { id, deleted_at: null }
    });

    if (!offer) {
      return commonService.notFound(res, enMessage.offer.notFound);
    }

    await offer.update({ status });

    return commonService.okResponse(res, {
      message: `Offer ${status === "Active" ? "activated" : "deactivated"} successfully`
    });

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
  generateOfferCode,
  getProducts,
  updateOfferStatus
};
