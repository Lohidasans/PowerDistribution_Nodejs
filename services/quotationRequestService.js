const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Helper function to get quotation with items
const getQuotationWithItems = async (quotationId) => {
  try {
    // --- Get quotation details ---
    const quotation = await models.Quotation.findByPk(quotationId, {
      raw: true,
      nest: true
    });

    if (!quotation) return null;

    // --- Get quotation items ---
    const items = await sequelize.query(`
      SELECT 
        qi.*,
        mt.material_type AS material_type_name,
        c.category_name AS category_name,
        sc.subcategory_name AS subcategory_name
      FROM "quotation_items" qi
      LEFT JOIN "materialTypes" mt ON qi.material_type_id = mt.id
      LEFT JOIN "categories" c ON qi.category_id = c.id
      LEFT JOIN "subcategories" sc ON qi.subcategory_id = sc.id
      WHERE qi.quotation_id = :quotationId
      ORDER BY qi.id ASC;
    `, {
      replacements: { quotationId },
      type: sequelize.QueryTypes.SELECT
    });

    // --- Get vendor details ---
    let vendorDetails = [];
    if (quotation.vendor_ids && quotation.vendor_ids.length > 0) {
      vendorDetails = await models.Vendor.findAll({
        where: { id: quotation.vendor_ids },
        attributes: ['id', 'vendor_name'],
        raw: true
      });
    }

    // --- Assemble final result ---
    return {
      ...quotation,
      vendors: vendorDetails,
      items: items || []
    };

  } catch (error) {
    console.error('Error in getQuotationWithItems:', error);
    // Return null instead of throwing to prevent rollback-after-commit
    return error;
  }
};

// Create Quotation Request with items
const createQuotationRequest = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { items = [], ...quotationData } = req.body;

    // Validate required fields
    const requiredFields = ["qr_id", "request_date", "expiry_date", "vendor_ids"];
    for (const field of requiredFields) {
      if (!quotationData[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    // Create Quotation Request
    const quotationRequest = await models.Quotation.create(quotationData, { transaction });

    // Create Quotation Items
    if (items && items.length > 0) {
      const quotationItems = items.map(item => ({
        ...item,
        quotation_id: quotationRequest.id
      }));
      await models.QuotationItem.bulkCreate(quotationItems, { transaction });
    }

    await transaction.commit();
    const result = await getQuotationWithItems(quotationRequest.id);
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get Quotation Request by ID
const getQuotationRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const quotationRequest = await getQuotationWithItems(id);
    
    if (!quotationRequest) {
      return commonService.notFound(res, "Quotation Request not found");
    }
    
    return commonService.okResponse(res, quotationRequest);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update Quotation Request with items
const updateQuotationRequest = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { items = [], vendor_ids, ...updateData } = req.body;

    // 1. Find existing quotation
    const quotationRequest = await models.Quotation.findByPk(id, { transaction });
    if (!quotationRequest) {
      await transaction.rollback();
      return commonService.notFound(res, "Quotation Request not found");
    }

    // 2. Update main quotation fields (excluding vendor_ids)
    const { vendor_ids: _, ...fieldsToUpdate } = updateData;
    if (Object.keys(fieldsToUpdate).length > 0) {
      await quotationRequest.update(fieldsToUpdate, { transaction });
    }

    // 3. Update vendor_ids separately (ARRAY field)
    if (Array.isArray(vendor_ids)) {
      await quotationRequest.update({ vendor_ids }, { transaction });
    }

    // 4. Handle items: Update existing ones
    const updatedItemIds = items.filter(item => item.id).map(item => item.id);

    for (const item of items) {
      if (item.id) {
        const existingItem = await models.QuotationItem.findOne({
          where: { id: item.id, quotation_id: id },
          transaction,
        });

        if (existingItem) {
          // DO NOT destructure `id` or `quotation_id`
          const updatable = {
            material_type_id: item.material_type_id,
            category_id: item.category_id,
            subcategory_id: item.subcategory_id,
            product_description: item.product_description,
            purity: item.purity ? parseFloat(item.purity) : null,
            weight: item.weight ? parseFloat(item.weight) : null,
            quantity: item.quantity,
          };

          console.log('Updating item ID:', item.id, updatable);
          await existingItem.update(updatable, { transaction });
        }
      }
    }

    await transaction.commit();

    // 6. Return fresh data
    const result = await getQuotationWithItems(id);
    return commonService.okResponse(res, result);

  } catch (error) {
    await transaction.rollback();
    console.error('Update error:', error);
    return commonService.handleError(res, error);
  }
};

// Delete Quotation Request (soft delete)
const deleteQuotationRequest = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const quotationRequest = await models.Quotation.findByPk(id, { transaction });
    
    if (!quotationRequest) {
      await transaction.rollback();
      return commonService.notFound(res, "Quotation Request not found");
    }

    // Soft delete Quotation Request and its items
    await Promise.all([
      quotationRequest.destroy({ transaction }),
      models.QuotationItem.destroy({ 
        where: { quotation_id: id },
        transaction 
      })
    ]);

    await transaction.commit();
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// List all Quotation Requests with pagination
const getAllQuotationRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      vendor_id,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // --- Base WHERE clause ---
    let whereSql = `WHERE q.deleted_at IS NULL`;
    const replacements = { limit: parseInt(limit), offset };

    // --- Apply filters ---
    if (vendor_id) {
      whereSql += ` AND (:vendor_id = ANY(q.vendor_ids))`;
      replacements.vendor_id = vendor_id;
    }
    if (search) {
      whereSql += ` AND (q.qr_id ILIKE :search OR v.vendor_name ILIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // --- Count total quotations ---
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT q.id
        FROM quotations q
        LEFT JOIN vendors v ON v.id = ANY(q.vendor_ids)
        ${whereSql}
        GROUP BY q.id
      ) t;
    `;
    const [countRows] = await sequelize.query(countQuery, { replacements });
    const total = parseInt(countRows?.[0]?.total || 0, 10);

    // --- Fetch data with vendor + item details ---
    const dataQuery = `
      SELECT 
        q.id,
        q.qr_id,
        q.request_date,
        q.expiry_date,
        q.status_id,
        q.remarks,
        ARRAY_AGG(DISTINCT v.vendor_name) AS vendor_names,
        ARRAY_AGG(DISTINCT v.vendor_image_url) AS vendor_images,
        STRING_AGG(DISTINCT c.category_name, ', ') AS category_names,
        STRING_AGG(DISTINCT sc.subcategory_name, ', ') AS subcategory_names,
        COALESCE(SUM(qi.quantity), 0) AS total_quantity,
        u.email AS created_by
      FROM quotations q
      LEFT JOIN vendors v ON v.id = ANY(q.vendor_ids)
      LEFT JOIN quotation_items qi ON qi.quotation_id = q.id AND qi.deleted_at IS NULL
      LEFT JOIN categories c ON qi.category_id = c.id
      LEFT JOIN subcategories sc ON qi.subcategory_id = sc.id
      LEFT JOIN users u ON u.id = q.created_by
      ${whereSql}
      GROUP BY q.id, u.email
      ORDER BY q.request_date DESC, q.id DESC
      LIMIT :limit OFFSET :offset;
    `;

    const [rows] = await sequelize.query(dataQuery, { replacements });

    // --- Send response ---
    return commonService.okResponse(res, {
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: rows,
    });

  } catch (error) {
    console.error("Error in getAllQuotationRequests:", error);
    return commonService.handleError(res, error);
  }
};


const generateQuotationRequestCode = async (req, res) => {
  try
  {
    const { prefix} = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Quotation,
      "qr_id",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { qr_id: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createQuotationRequest,
  getQuotationRequestById,
  updateQuotationRequest,
  deleteQuotationRequest,
  getAllQuotationRequests,
  generateQuotationRequestCode
};
