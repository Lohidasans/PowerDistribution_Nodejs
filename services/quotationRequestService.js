const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// ==================== HELPER FUNCTIONS ====================

// Calculate quotation status based on vendor responses
const calculateQuotationStatus = async (quotationId, transaction = null) => {
  try {
    const vendorQuotations = await models.VendorQuotation.findAll({
      where: { quotation_id: quotationId },
      attributes: ["status"],
      raw: true,
      transaction,
    });

    if (!vendorQuotations || vendorQuotations.length === 0) {
      return 1; // Pending (no vendors)
    }

    const statuses = vendorQuotations.map((vq) => vq.status);
    const totalVendors = statuses.length;

    // Count different status types
    const receivedCount = statuses.filter((s) => s === "received").length;
    const rejectedCount = statuses.filter((s) => s === "rejected").length;
    const pendingCount = statuses.filter((s) => s === "pending").length;

    // Status 1: Pending - No vendors have responded yet
    if (receivedCount === 0 && rejectedCount === 0) {
      return 1; // Pending
    }

    // Status 4: Rejected - All vendors have rejected
    if (rejectedCount === totalVendors) {
      return 4; // Rejected
    }

    // Status 3: Received - All vendors have accepted
    if (receivedCount === totalVendors) {
      return 3; // Received
    }

    // Status 2: Partially Received - Some accepted, some pending/rejected (but not all)
    return 2; // Partially Received
  } catch (error) {
    console.error("Error calculating quotation status:", error);
    return 1; // Default to pending on error
  }
};

// Helper function to get quotation with items and vendor responses
const getQuotationWithItems = async (quotationId, transaction = null) => {
  try {
    // --- Get quotation details ---
    const quotation = await models.Quotation.findByPk(quotationId, {
      transaction
    });

    if (!quotation) {
      console.log(`Quotation with id ${quotationId} not found`);
      return null;
    }

    // Convert to plain object
    const quotationData = quotation.toJSON();

    // --- Get quotation items (base items without vendor-specific data) ---
    const items = await sequelize.query(
      `
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
        AND qi.vendor_quotation_id IS NULL
        AND qi.deleted_at IS NULL
      ORDER BY qi.id ASC;
    `,
      {
        replacements: { quotationId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      },
    );

    // --- Get vendor quotations with their responses ---
    const vendorQuotations = await sequelize.query(
      `
      SELECT 
        vq.*,
        v.vendor_name,
        v.vendor_image_url,
        v.email AS vendor_email,
        v.mobile AS vendor_phone
      FROM "vendor_quotations" vq
      LEFT JOIN "vendors" v ON vq.vendor_id = v.id
      WHERE vq.quotation_id = :quotationId
        AND vq.deleted_at IS NULL
      ORDER BY vq.id ASC;
    `,
      {
        replacements: { quotationId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      },
    );

    // --- For each vendor quotation, get their item responses ---
    for (let vq of vendorQuotations) {
      const vendorItems = await sequelize.query(
        `
        SELECT 
          qi.*,
          mt.material_type AS material_type_name,
          c.category_name AS category_name,
          sc.subcategory_name AS subcategory_name
        FROM "quotation_items" qi
        LEFT JOIN "materialTypes" mt ON qi.material_type_id = mt.id
        LEFT JOIN "categories" c ON qi.category_id = c.id
        LEFT JOIN "subcategories" sc ON qi.subcategory_id = sc.id
        WHERE qi.vendor_quotation_id = :vendorQuotationId
          AND qi.deleted_at IS NULL
        ORDER BY qi.id ASC;
      `,
        {
          replacements: { vendorQuotationId: vq.id },
          type: sequelize.QueryTypes.SELECT,
          transaction
        },
      );

      vq.items = vendorItems || [];
    }

    // --- Assemble final result ---
    return {
      ...quotationData,
      items: items || [],
      vendor_quotations: vendorQuotations || [],
    };
  } catch (error) {
    console.error("Error in getQuotationWithItems:", error);
    return null;
  }
};

// Create Quotation Request with items
const createQuotationRequest = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { items = [], ...quotationData } = req.body;

    // Validate required fields
    const requiredFields = [
      "qr_id",
      "request_date",
      "expiry_date",
      "vendor_ids",
    ];
    for (const field of requiredFields) {
      if (!quotationData[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    // Validate vendor_ids is an array
    if (
      !Array.isArray(quotationData.vendor_ids) ||
      quotationData.vendor_ids.length === 0
    ) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "vendor_ids must be a non-empty array",
      );
    }

    // Create Quotation Request with status_id = 1 (Pending)
    const quotationRequest = await models.Quotation.create(
      {
        ...quotationData,
        status_id: 1, // Pending
      },
      { transaction },
    );

    // Create base Quotation Items (without vendor_quotation_id)
    if (items && items.length > 0) {
      const quotationItems = items.map((item) => ({
        ...item,
        quotation_id: quotationRequest.id,
        vendor_quotation_id: null, // Base items don't belong to any vendor yet
      }));
      await models.QuotationItem.bulkCreate(quotationItems, { transaction });
    }

    // Create VendorQuotation records for each vendor (status = 'pending')
    const vendorQuotations = quotationData.vendor_ids.map((vendorId) => ({
      quotation_id: quotationRequest.id,
      vendor_id: vendorId,
      status: "pending",
      created_by: quotationData.created_by,
    }));
    await models.VendorQuotation.bulkCreate(vendorQuotations, { transaction });

    // Fetch the complete result BEFORE committing (pass transaction)
    const result = await getQuotationWithItems(quotationRequest.id, transaction);

    await transaction.commit();

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
    const quotationRequest = await models.Quotation.findByPk(id, {
      transaction,
    });
    if (!quotationRequest) {
      await transaction.rollback();
      return commonService.notFound(res, "Quotation Request not found");
    }

    // 2. Update main quotation fields (excluding vendor_ids and status_id)
    const { vendor_ids: _, status_id: __, ...fieldsToUpdate } = updateData;
    if (Object.keys(fieldsToUpdate).length > 0) {
      await quotationRequest.update(fieldsToUpdate, { transaction });
    }

    // 3. Handle vendor_ids changes
    if (Array.isArray(vendor_ids)) {
      const currentVendorIds = quotationRequest.vendor_ids || [];
      const newVendorIds = vendor_ids;

      // Find vendors to add and remove
      const vendorsToAdd = newVendorIds.filter(
        (vid) => !currentVendorIds.includes(vid),
      );
      const vendorsToRemove = currentVendorIds.filter(
        (vid) => !newVendorIds.includes(vid),
      );

      // Add new vendor quotations
      if (vendorsToAdd.length > 0) {
        const newVendorQuotations = vendorsToAdd.map((vendorId) => ({
          quotation_id: id,
          vendor_id: vendorId,
          status: "pending",
          created_by: updateData.updated_by,
        }));
        await models.VendorQuotation.bulkCreate(newVendorQuotations, {
          transaction,
        });
      }

      // Soft delete removed vendor quotations
      if (vendorsToRemove.length > 0) {
        await models.VendorQuotation.destroy({
          where: {
            quotation_id: id,
            vendor_id: vendorsToRemove,
          },
          transaction,
        });
      }

      // Update vendor_ids array
      await quotationRequest.update({ vendor_ids }, { transaction });
    }

    // 4. Handle base items updates (items without vendor_quotation_id)
    if (items && items.length > 0) {
      for (const item of items) {
        if (item.id) {
          // Update existing item
          const existingItem = await models.QuotationItem.findOne({
            where: {
              id: item.id,
              quotation_id: id,
              vendor_quotation_id: null, // Only update base items
            },
            transaction,
          });

          if (existingItem) {
            const updatable = {
              material_type_id: item.material_type_id,
              category_id: item.category_id,
              subcategory_id: item.subcategory_id,
              product_description: item.product_description,
              purity: item.purity ? parseFloat(item.purity) : null,
              weight: item.weight ? parseFloat(item.weight) : null,
              quantity: item.quantity,
            };
            await existingItem.update(updatable, { transaction });
          }
        }
      }
    }

    // 5. Recalculate quotation status
    const newStatus = await calculateQuotationStatus(id, transaction);
    await quotationRequest.update({ status_id: newStatus }, { transaction });

    // 6. Return fresh data (fetch before commit)
    const result = await getQuotationWithItems(id, transaction);

    await transaction.commit();

    return commonService.okResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error("Update error:", error);
    return commonService.handleError(res, error);
  }
};

// Delete Quotation Request (soft delete)
const deleteQuotationRequest = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const quotationRequest = await models.Quotation.findByPk(id, {
      transaction,
    });

    if (!quotationRequest) {
      await transaction.rollback();
      return commonService.notFound(res, "Quotation Request not found");
    }

    // Soft delete Quotation Request, its items, and vendor quotations
    await Promise.all([
      quotationRequest.destroy({ transaction }),
      models.QuotationItem.destroy({
        where: { quotation_id: id },
        transaction,
      }),
      models.VendorQuotation.destroy({
        where: { quotation_id: id },
        transaction,
      }),
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
    const { page, limit, type = "sent", status_id, vendor_id, search } = req.query;

    // --- Optional Pagination ---
    const isPaginated = page && limit;
    const parsedPage = isPaginated ? parseInt(page) : 1;
    const parsedLimit = isPaginated ? parseInt(limit) : null;
    const offset = isPaginated ? (parsedPage - 1) * parsedLimit : null;

    // --- Base WHERE clause for SENT list ---
    let whereSql = `WHERE q.deleted_at IS NULL`;
    const replacements = {};

    if (status_id) {
      whereSql += ` AND q.status_id = :status_id`;
      replacements.status_id = parseInt(status_id);
    }

    if (vendor_id) {
      whereSql += ` AND :vendor_id = ANY(q.vendor_ids)`;
      replacements.vendor_id = parseInt(vendor_id);
    }

    if (search) {
      whereSql += ` AND (q.qr_id ILIKE :search OR v.vendor_name ILIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // SCORE CARDS (DYNAMIC & FILTER-AWARE)
    let sentWhereSql = `WHERE q.deleted_at IS NULL`;
    let receivedWhereSql = `WHERE vq.deleted_at IS NULL AND vq.status = 'accepted'`;
    const scoreReplacements = {};

    if (vendor_id) {
      sentWhereSql += ` AND :vendor_id = ANY(q.vendor_ids)`;
      receivedWhereSql += ` AND vq.vendor_id = :vendor_id`;
      scoreReplacements.vendor_id = parseInt(vendor_id);
    }

    if (search) {
      sentWhereSql += ` AND (q.qr_id ILIKE :search OR v.vendor_name ILIKE :search)`;
      receivedWhereSql += ` AND (q.qr_id ILIKE :search OR v.vendor_name ILIKE :search)`;
      scoreReplacements.search = `%${search}%`;
    }

    const scoreCardQuery = `
      SELECT
        (
          SELECT COUNT(DISTINCT q.id)
          FROM quotations q
          LEFT JOIN vendors v ON v.id = ANY(q.vendor_ids)
          ${sentWhereSql}
        ) AS sent_count,

        (
          SELECT COUNT(DISTINCT vq.id)
          FROM vendor_quotations vq
          LEFT JOIN quotations q ON q.id = vq.quotation_id
          LEFT JOIN vendors v ON v.id = vq.vendor_id
          ${receivedWhereSql}
        ) AS received_count
    `;

    const [scoreCardResult] = await sequelize.query(scoreCardQuery, {
      replacements: scoreReplacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const scoreCards = {
      sent: parseInt(scoreCardResult?.sent_count || 0),
      received: parseInt(scoreCardResult?.received_count || 0),
    };

    // DATA FETCH
    let data, total;
    if (type === "received") {
      // ---------------- RECEIVED ----------------
      let vqWhereSql = `WHERE vq.deleted_at IS NULL AND vq.status = 'accepted'`;
      const vqReplacements = {};

      if (vendor_id) {
        vqWhereSql += ` AND vq.vendor_id = :vendor_id`;
        vqReplacements.vendor_id = parseInt(vendor_id);
      }

      if (search) {
        vqWhereSql += ` AND (q.qr_id ILIKE :search OR v.vendor_name ILIKE :search)`;
        vqReplacements.search = `%${search}%`;
      }

      const vqCountQuery = `
        SELECT COUNT(*) AS total
        FROM vendor_quotations vq
        LEFT JOIN quotations q ON q.id = vq.quotation_id
        LEFT JOIN vendors v ON v.id = vq.vendor_id
        ${vqWhereSql};
      `;

      const [vqCountResult] = await sequelize.query(vqCountQuery, {
        replacements: vqReplacements,
        type: sequelize.QueryTypes.SELECT,
      });

      total = parseInt(vqCountResult?.total || 0);

      let vqDataQuery = `
        SELECT 
          vq.id AS vendor_quotation_id,
          vq.quotation_id,
          vq.vendor_quotation_number,
          vq.status,
          vq.response_date,
          vq.sub_total,
          vq.total_amount,
          q.qr_id,
          q.request_date,
          q.expiry_date,
          q.status_id AS quotation_status_id,
          v.id AS vendor_id,
          v.vendor_name,
          v.vendor_image_url,
          STRING_AGG(DISTINCT qi.product_description, ', ') AS item_details,
          COALESCE(SUM(qi.quantity), 0) AS total_quantity
        FROM vendor_quotations vq
        LEFT JOIN quotations q ON q.id = vq.quotation_id
        LEFT JOIN vendors v ON v.id = vq.vendor_id
        LEFT JOIN quotation_items qi 
          ON qi.vendor_quotation_id = vq.id 
          AND qi.deleted_at IS NULL
        ${vqWhereSql}
        GROUP BY vq.id, q.id, v.id
        ORDER BY vq.response_date DESC, vq.id DESC
      `;

      if (isPaginated) {
        vqDataQuery += ` LIMIT :limit OFFSET :offset`;
        vqReplacements.limit = parsedLimit;
        vqReplacements.offset = offset;
      }

      data = await sequelize.query(vqDataQuery, {
        replacements: vqReplacements,
        type: sequelize.QueryTypes.SELECT,
      });

    } else {
      // ---------------- SENT ----------------
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

      const [countResult] = await sequelize.query(countQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      });

      total = parseInt(countResult?.total || 0);

      let dataQuery = `
        SELECT 
          q.id,
          q.qr_id,
          q.request_date,
          q.expiry_date,
          q.status_id,
          q.remarks,
          ARRAY_AGG(DISTINCT v.id) FILTER (WHERE v.id IS NOT NULL) AS vendor_ids,
          ARRAY_AGG(DISTINCT v.vendor_name) FILTER (WHERE v.vendor_name IS NOT NULL) AS vendor_names,
          ARRAY_AGG(DISTINCT v.vendor_image_url) FILTER (WHERE v.vendor_image_url IS NOT NULL) AS vendor_images,
          STRING_AGG(DISTINCT qi.product_description, ', ') AS item_details,
          COALESCE(SUM(qi.quantity), 0) AS total_quantity,
          u.email AS created_by,
          COUNT(DISTINCT vq.id) FILTER (WHERE vq.status = 'pending') AS pending_vendors,
          COUNT(DISTINCT vq.id) FILTER (WHERE vq.status = 'received') AS received_vendors,
          COUNT(DISTINCT vq.id) AS total_vendors
        FROM quotations q
        LEFT JOIN vendors v ON v.id = ANY(q.vendor_ids)
        LEFT JOIN vendor_quotations vq ON vq.quotation_id = q.id AND vq.deleted_at IS NULL
        LEFT JOIN quotation_items qi 
          ON qi.quotation_id = q.id 
          AND qi.vendor_quotation_id IS NULL 
          AND qi.deleted_at IS NULL
        LEFT JOIN users u ON u.id = q.created_by
        ${whereSql}
        GROUP BY q.id, u.email
        ORDER BY q.request_date DESC, q.id DESC
      `;

      if (isPaginated) {
        dataQuery += ` LIMIT :limit OFFSET :offset`;
        replacements.limit = parsedLimit;
        replacements.offset = offset;
      }

      data = await sequelize.query(dataQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      });
    }
    return commonService.okResponse(res, {
      score_cards: scoreCards,
      total,
      page: isPaginated ? parsedPage : null,
      totalPages: isPaginated ? Math.ceil(total / parsedLimit) : 1,
      data,
    });

  } catch (error) {
    console.error("Error in getAllQuotationRequests:", error);
    return commonService.handleError(res, error);
  }
};


// Generate Quotation Request Code
const generateQuotationRequestCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Quotation,
      "qr_id",
      String(prefix).toUpperCase(),
      { pad: 3 },
    );
    return commonService.okResponse(res, { qr_id: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// ==================== VENDOR QUOTATION FUNCTIONS ====================

// Generate Vendor Quotation Code
const generateVendorQuotationCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.VendorQuotation,
      "vendor_quotation_number",
      String(prefix).toUpperCase(),
      { pad: 3 },
    );
    return commonService.okResponse(res, { vendor_quotation_number: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Vendor Quotation by ID (for vendor portal)
const getVendorQuotationById = async (req, res) => {
  try {
    const { id } = req.params; // vendor_quotation_id

    const vendorQuotation = await sequelize.query(
      `
      SELECT 
        vq.*,
        q.qr_id,
        q.request_date,
        q.expiry_date,
        q.remarks AS quotation_remarks,
        v.vendor_name,
        v.vendor_image_url,
        v.address AS vendor_address,
        v.pin_code AS vendor_pincode,
        s.state_name AS vendor_state,
        d.district_name AS vendor_city
      FROM "vendor_quotations" vq
      LEFT JOIN "quotations" q ON vq.quotation_id = q.id
      LEFT JOIN "vendors" v ON vq.vendor_id = v.id
      LEFT JOIN "states" s ON v.state_id = s.id
      LEFT JOIN "districts" d ON v.district_id = d.id
      WHERE vq.id = :id AND vq.deleted_at IS NULL
      LIMIT 1;
    `,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    if (!vendorQuotation || vendorQuotation.length === 0) {
      return commonService.notFound(res, "Vendor Quotation not found");
    }

    const vq = vendorQuotation[0];

    // Get base items for this quotation
    const baseItems = await sequelize.query(
      `
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
        AND qi.vendor_quotation_id IS NULL
        AND qi.deleted_at IS NULL
      ORDER BY qi.id ASC;
    `,
      {
        replacements: { quotationId: vq.quotation_id },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    // Get vendor-specific items (if vendor has submitted rates)
    const vendorItems = await sequelize.query(
      `
      SELECT 
        qi.*,
        mt.material_type AS material_type_name,
        c.category_name AS category_name,
        sc.subcategory_name AS subcategory_name
      FROM "quotation_items" qi
      LEFT JOIN "materialTypes" mt ON qi.material_type_id = mt.id
      LEFT JOIN "categories" c ON qi.category_id = c.id
      LEFT JOIN "subcategories" sc ON qi.subcategory_id = sc.id
      WHERE qi.vendor_quotation_id = :vendorQuotationId
        AND qi.deleted_at IS NULL
      ORDER BY qi.id ASC;
    `,
      {
        replacements: { vendorQuotationId: id },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    return commonService.okResponse(res, {
      ...vq,
      base_items: baseItems || [],
      vendor_items: vendorItems || [],
    });
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update Vendor Quotation Status (accept/reject)
const updateVendorQuotationStatus = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params; // vendor_quotation_id
    const { status, remarks } = req.body;

    // Validate status
    if (!["accepted", "rejected"].includes(status)) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "Status must be 'accepted' or 'rejected'",
      );
    }

    // Find vendor quotation
    const vendorQuotation = await models.VendorQuotation.findByPk(id, {
      transaction,
    });
    if (!vendorQuotation) {
      await transaction.rollback();
      return commonService.notFound(res, "Vendor Quotation not found");
    }

    // Update vendor quotation status
    await vendorQuotation.update(
      {
        status,
        response_date: new Date(),
        remarks: remarks || vendorQuotation.remarks,
      },
      { transaction },
    );

    // Recalculate main quotation status
    const newStatus = await calculateQuotationStatus(
      vendorQuotation.quotation_id,
      transaction,
    );
    await models.Quotation.update(
      { status_id: newStatus },
      {
        where: { id: vendorQuotation.quotation_id },
        transaction,
      },
    );

    // Fetch result before commit
    const result = await getQuotationWithItems(vendorQuotation.quotation_id, transaction);

    await transaction.commit();

    return commonService.okResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Submit Vendor Rates (vendor submits their pricing)
const submitVendorRates = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params; // vendor_quotation_id
    const { items, remarks } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return commonService.badRequest(res, "Items array is required");
    }

    // Find vendor quotation
    const vendorQuotation = await models.VendorQuotation.findByPk(id, {
      transaction,
    });
    if (!vendorQuotation) {
      await transaction.rollback();
      return commonService.notFound(res, "Vendor Quotation not found");
    }

    // Get base items for this quotation
    const baseItems = await models.QuotationItem.findAll({
      where: {
        quotation_id: vendorQuotation.quotation_id,
        vendor_quotation_id: null,
      },
      transaction,
    });

    // Delete existing vendor-specific items (if any)
    await models.QuotationItem.destroy({
      where: {
        vendor_quotation_id: id,
      },
      transaction,
    });

    // Create new vendor-specific items with rates
    const vendorItems = items.map((item) => {
      const baseItem = baseItems.find((bi) => bi.id === item.base_item_id);
      if (!baseItem) {
        throw new Error(`Base item with id ${item.base_item_id} not found`);
      }

      return {
        quotation_id: vendorQuotation.quotation_id,
        vendor_quotation_id: id,
        material_type_id: baseItem.material_type_id,
        category_id: baseItem.category_id,
        subcategory_id: baseItem.subcategory_id,
        product_description: baseItem.product_description,
        purity: baseItem.purity,
        weight: baseItem.weight,
        quantity: baseItem.quantity,
        rate: item.rate ? parseFloat(item.rate) : null,
        amount: item.amount ? parseFloat(item.amount) : null,
        vendor_remarks: item.vendor_remarks || null,
      };
    });

    await models.QuotationItem.bulkCreate(vendorItems, { transaction });

    // Update vendor quotation status to 'received' and save financial details
    await vendorQuotation.update(
      {
        status: "received",
        response_date: new Date(),
        remarks: remarks || vendorQuotation.remarks,
        sub_total: req.body.sub_total ? parseFloat(req.body.sub_total) : null,
        sgst_percentage: req.body.sgst_percentage
          ? parseFloat(req.body.sgst_percentage)
          : null,
        sgst_amount: req.body.sgst_amount
          ? parseFloat(req.body.sgst_amount)
          : null,
        cgst_percentage: req.body.cgst_percentage
          ? parseFloat(req.body.cgst_percentage)
          : null,
        cgst_amount: req.body.cgst_amount
          ? parseFloat(req.body.cgst_amount)
          : null,
        discount_percentage: req.body.discount_percentage
          ? parseFloat(req.body.discount_percentage)
          : null,
        discount_amount: req.body.discount_amount
          ? parseFloat(req.body.discount_amount)
          : null,
        total_amount: req.body.total_amount
          ? parseFloat(req.body.total_amount)
          : null,
        terms_and_conditions: req.body.terms_and_conditions || null,
        attachment_url: req.body.attachment_url || null,
        vendor_quotation_number: req.body.vendor_quotation_number || null,
      },
      { transaction },
    );

    // Recalculate main quotation status
    const newStatus = await calculateQuotationStatus(
      vendorQuotation.quotation_id,
      transaction,
    );
    await models.Quotation.update(
      { status_id: newStatus },
      {
        where: { id: vendorQuotation.quotation_id },
        transaction,
      },
    );

    // Fetch result before commit
    const result = await getQuotationWithItems(vendorQuotation.quotation_id, transaction);

    await transaction.commit();

    return commonService.okResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error("Submit vendor rates error:", error);
    return commonService.handleError(res, error);
  }
};

// Get All Vendor Quotations with Score Cards and Filtering
const getAllVendorQuotations = async (req, res) => {
  try {
    const { page, limit, status = "received", search } = req.query;

    const isPaginated = page && limit;

    const parsedPage = isPaginated ? parseInt(page) : 1;
    const parsedLimit = isPaginated ? parseInt(limit) : null;
    const offset = isPaginated ? (parsedPage - 1) * parsedLimit : null;

    // --- Build WHERE clause ---
    let whereSql = `WHERE vq.deleted_at IS NULL`;
    const replacements = {};

    if (status) {
      whereSql += ` AND vq.status = :status`;
      replacements.status = status;
    }

    if (search) {
      whereSql += ` AND (q.qr_id ILIKE :search OR v.vendor_name ILIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // --- Score Cards (unchanged) ---
    const scoreCardQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE vq.status = 'received') AS received_count,
        COUNT(*) FILTER (WHERE vq.status = 'pending') AS sent_count,
        COUNT(*) FILTER (WHERE vq.status = 'rejected') AS rejected_count
      FROM vendor_quotations vq
      WHERE vq.deleted_at IS NULL;
    `;

    const [scoreCardResult] = await sequelize.query(scoreCardQuery, {
      type: sequelize.QueryTypes.SELECT,
    });

    const scoreCards = {
      received: parseInt(scoreCardResult?.received_count || 0),
      sent: parseInt(scoreCardResult?.sent_count || 0),
      rejected: parseInt(scoreCardResult?.rejected_count || 0),
    };

    // --- Total Count ---
    const countQuery = `
      SELECT COUNT(DISTINCT vq.id) AS total
      FROM vendor_quotations vq
      LEFT JOIN quotations q ON vq.quotation_id = q.id
      LEFT JOIN vendors v ON vq.vendor_id = v.id
      ${whereSql};
    `;

    const [countResult] = await sequelize.query(countQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const total = parseInt(countResult?.total || 0);

    // --- Data Query ---
    let dataQuery = `
      SELECT
        vq.id,
        vq.quotation_id,
        vq.vendor_id,
        vq.status,
        vq.response_date,
        vq.total_amount,
        vq.vendor_quotation_number,
        q.qr_id,
        q.request_date,
        q.expiry_date,
        v.vendor_name,
        v.vendor_image_url,
        STRING_AGG(
          DISTINCT qi.product_description,
          ', '
        ) AS item_details,
        COALESCE(SUM(qi.quantity), 0) AS quantity

      FROM vendor_quotations vq
      LEFT JOIN quotations q ON vq.quotation_id = q.id
      LEFT JOIN vendors v ON vq.vendor_id = v.id
      LEFT JOIN quotation_items qi ON qi.quotation_id = vq.quotation_id AND qi.deleted_at IS NULL
      ${whereSql}
      GROUP BY 
        vq.id,
        q.qr_id,
        q.request_date,
        q.expiry_date,
        v.vendor_name,
        v.vendor_image_url
      ORDER BY q.request_date DESC, vq.id DESC;
    `;

    if (isPaginated) {
      dataQuery += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = parsedLimit;
      replacements.offset = offset;
    }

    const data = await sequelize.query(dataQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // --- Response ---
    return commonService.okResponse(res, {
      score_cards: scoreCards,
      total,
      page: isPaginated ? parsedPage : null,
      totalPages: isPaginated ? Math.ceil(total / parsedLimit) : 1,
      data,
    });

  } catch (error) {
    console.error("Error in getAllVendorQuotations:", error);
    return commonService.handleError(res, error);
  }
};


module.exports = {
  createQuotationRequest,
  getQuotationRequestById,
  updateQuotationRequest,
  deleteQuotationRequest,
  getAllQuotationRequests,
  generateQuotationRequestCode,
  // Vendor-specific functions
  generateVendorQuotationCode,
  getVendorQuotationById,
  updateVendorQuotationStatus,
  submitVendorRates,
  getAllVendorQuotations,
};
