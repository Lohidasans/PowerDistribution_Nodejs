const { models, sequelize } = require("../models");
const { Op } = require("sequelize");
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

    // No vendors
    if (!vendorQuotations || vendorQuotations.length === 0) {
      return 1; // Pending (no vendors)
    }

    const statuses = vendorQuotations.map((vq) =>
      (vq.status || "pending").toLowerCase()
    );

    const totalVendors = statuses.length;

    // Accepted / Received
    const acceptedCount = statuses.filter(
      (s) => s === "accepted" || s === "received"
    ).length;
    // Rejected
    const rejectedCount = statuses.filter((s) => s === "rejected").length;
    // Pending / Did not respond
    const pendingCount = statuses.filter((s) => s === "pending").length;

    /*
      STATUS IDS
      1 -> Pending
      2 -> Partially Received
      3 -> Received / Accepted
      4 -> Rejected
      5 -> Partially Rejected
    */

    // -----------------------------------
    // BOTH / ALL PENDING
    // both vendors - did not respond
    // -----------------------------------
    if (pendingCount === totalVendors) {
      return 1; // Pending
    }

    // -----------------------------------
    // BOTH / ALL REJECTED
    // both vendors rejected
    // -----------------------------------
    if (rejectedCount === totalVendors) {
      return 4; // Rejected
    }

    // -----------------------------------
    // BOTH / ALL ACCEPTED
    // both vendors accepted
    // -----------------------------------
    if (acceptedCount === totalVendors) {
      return 3; // Accepted / Received
    }

    // -----------------------------------
    // PARTIALLY REJECTED
    // one rejected + one pending
    // -----------------------------------
    if (rejectedCount > 0 && acceptedCount === 0 && pendingCount > 0) {
      return 5; // Partially Rejected
    }

    // -----------------------------------
    // PARTIALLY RECEIVED
    // one accepted + one pending
    // one accepted + one rejected
    // -----------------------------------
    if (acceptedCount > 0) {
      return 2; // Partially Received
    }

    // fallback
    return 1;
  } catch (error) {
    console.error("Error calculating quotation status:", error);
    return 1; // Pending fallback
  }
};

// Helper function to get quotation with items and vendor responses
const getQuotationWithItems = async (quotationId, transaction = null) => {
  try {
    // --- Get quotation ---
    const quotation = await models.Quotation.findByPk(quotationId, {
      transaction,
    });

    if (!quotation) return null;

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
        transaction,
      }
    );

    const itemIds = items.map((i) => i.id);

    // FETCH MATERIALS
    const materials = await models.AdditionalMaterial.findAll({
      where: {
        parent_type: "quotation_item",
        parent_id: itemIds,
      },
      raw: true,
      transaction,
    });

    // GROUP MATERIALS
    const materialMap = {};
    materials.forEach((m) => {
      if (!materialMap[m.parent_id]) materialMap[m.parent_id] = [];
      materialMap[m.parent_id].push(m);
    });

    const enrichedItems = items.map((item) => ({
      ...item,
      additional_materials: materialMap[item.id] || [],
    }));

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
        transaction,
      }
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
          transaction,
        }
      );

      const vendorItemIds = vendorItems.map((i) => i.id);
      const vendorMaterials = await models.AdditionalMaterial.findAll({
        where: {
          parent_type: "quotation_item",
          parent_id: vendorItemIds,
        },
        raw: true,
        transaction,
      });

      const vendorMaterialMap = {};
      vendorMaterials.forEach((m) => {
        if (!vendorMaterialMap[m.parent_id])
          vendorMaterialMap[m.parent_id] = [];
        vendorMaterialMap[m.parent_id].push(m);
      });

      vq.items = vendorItems.map((item) => ({
        ...item,
        additional_materials: vendorMaterialMap[item.id] || [],
      }));
    }

    return {
      ...quotationData,
      items: enrichedItems,
      vendor_quotations: vendorQuotations,
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
        "vendor_ids must be a non-empty array"
      );
    }

    // Create Quotation Request with status_id = 1 (Pending)
    const quotationRequest = await models.Quotation.create(
      {
        ...quotationData,
        status_id: 1, // Pending
      },
      { transaction }
    );

    // Create base Quotation Items (without vendor_quotation_id) + ADDITIONAL MATERIALS
    for (const item of items) {
      const createdItem = await models.QuotationItem.create(
        {
          quotation_id: quotationRequest.id,
          vendor_quotation_id: null,

          material_type_id: item.material_type_id,
          category_id: item.category_id,
          subcategory_id: item.subcategory_id,

          ref_no: item.ref_no || null,
          material_price_per_g: item.material_price_per_g || null,
          purity: item.purity || null,
          type: item.type || null,
          quantity: item.quantity || 1,

          total_wt_in_g: item.total_wt_in_g || null,
          bag_wt_in_g: item.bag_wt_in_g || null,
          gross_wt_in_g: item.gross_wt_in_g || null,
          stone_wt_in_g: item.stone_wt_in_g || null,

          others: item.others || null,
          others_wt_in_g: item.others_wt_in_g || null,
          others_value: item.others_value || null,

          net_wt_in_g: item.net_wt_in_g || null,

          purchase_rate: item.purchase_rate || null,
          stone_rate: item.stone_rate || null,
          making_charge: item.making_charge || null,
          rate_per_g: item.rate_per_g || null,

          amount: item.amount || null,
          vendor_remarks: item.vendor_remarks || null,

          created_by: quotationData.created_by,
        },
        { transaction }
      );

      // 👇 ADDITIONAL MATERIALS
      if (item.additional_materials?.length) {
        const materials = item.additional_materials.map((m) => ({
          parent_type: "quotation_item",
          parent_id: createdItem.id,
          label: m.label,
          weight_in_g: m.weight_in_g || 0,
          value: m.value || 0,
        }));

        await models.AdditionalMaterial.bulkCreate(materials, {
          transaction,
        });
      }
    }

    // Vendor quotations
    const vendorQuotations = quotationData.vendor_ids.map((vendorId) => ({
      quotation_id: quotationRequest.id,
      vendor_id: vendorId,
      status: "pending",
      created_by: quotationData.created_by,
      branch_id: quotationData.branch_id || 1, // Pass branch_id from quotation data or default to 1
    }));
    await models.VendorQuotation.bulkCreate(vendorQuotations, { transaction });

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
    const { items = [], vendor_ids, qr_id, ...updateData } = req.body;

    // ❌ Block qr_id update
    if (qr_id !== undefined) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "QR ID cannot be modified once created"
      );
    }

    const quotationRequest = await models.Quotation.findByPk(id, {
      transaction,
    });

    if (!quotationRequest) {
      await transaction.rollback();
      return commonService.notFound(res, "Quotation Request not found");
    }

 // 2. Update main quotation fields (excluding vendor_ids & status_id)
    const { vendor_ids: _, status_id: __, ...fieldsToUpdate } = updateData;

    if (Object.keys(fieldsToUpdate).length > 0) {
      await quotationRequest.update(fieldsToUpdate, { transaction });
    }

    // 3. Handle vendor_ids changes
    if (Array.isArray(vendor_ids)) {
      const currentVendorIds = quotationRequest.vendor_ids || [];

      const vendorsToAdd = vendor_ids.filter(
        (vid) => !currentVendorIds.includes(vid)
      );

      const vendorsToRemove = currentVendorIds.filter(
        (vid) => !vendor_ids.includes(vid)
      );

      // ✅ Add new vendors
      if (vendorsToAdd.length) {
        const newVendorQuotations = vendorsToAdd.map((vendorId) => ({
          quotation_id: id,
          vendor_id: vendorId,
          status: "pending",
          created_by: updateData.updated_by,
          branch_id:
            quotationRequest.branch_id || updateData.branch_id || 1,
        }));

        await models.VendorQuotation.bulkCreate(newVendorQuotations, {
          transaction,
        });
      }

      // ✅ Remove vendors (soft delete)
      if (vendorsToRemove.length) {
        await models.VendorQuotation.destroy({
          where: {
            quotation_id: id,
            vendor_id: vendorsToRemove,
          },
          transaction,
        });
      }

      await quotationRequest.update({ vendor_ids }, { transaction });
    }

    // 4. 🔥 FULL ITEM SYNC (UPDATE + CREATE + DELETE)

    // Get existing base items
    const existingItems = await models.QuotationItem.findAll({
      where: {
        quotation_id: id,
        vendor_quotation_id: null,
      },
      transaction,
    });

    const existingItemMap = new Map(
      existingItems.map((item) => [item.id, item])
    );

    const incomingIds = [];

    // UPSERT ITEMS + MATERIALS
    for (const item of items) {
      let quotationItem;

      if (item.id && existingItemMap.has(item.id)) {
        // UPDATE
        quotationItem = existingItemMap.get(item.id);

        await quotationItem.update(
          {
            material_type_id: item.material_type_id,
            category_id: item.category_id,
            subcategory_id: item.subcategory_id,

            ref_no: item.ref_no || null,
            material_price_per_g: item.material_price_per_g || null,
            purity: item.purity || null,
            type: item.type || null,
            quantity: item.quantity,

            total_wt_in_g: item.total_wt_in_g || null,
            bag_wt_in_g: item.bag_wt_in_g || null,
            gross_wt_in_g: item.gross_wt_in_g || null,
            stone_wt_in_g: item.stone_wt_in_g || null,

            others: item.others || null,
            others_wt_in_g: item.others_wt_in_g || null,
            others_value: item.others_value || null,

            net_wt_in_g: item.net_wt_in_g || null,

            purchase_rate: item.purchase_rate || null,
            stone_rate: item.stone_rate || null,
            making_charge: item.making_charge || null,
            rate_per_g: item.rate_per_g || null,

            amount: item.amount || null,

            updated_by: updateData.updated_by,
          },
          { transaction }
        );
      } else {
        // CREATE
        quotationItem = await models.QuotationItem.create(
          {
            quotation_id: id,
            vendor_quotation_id: null,

            material_type_id: item.material_type_id,
            category_id: item.category_id,
            subcategory_id: item.subcategory_id,

            ref_no: item.ref_no || null,
            material_price_per_g: item.material_price_per_g || null,
            purity: item.purity || null,
            type: item.type || null,
            quantity: item.quantity || 1,

            total_wt_in_g: item.total_wt_in_g || null,
            bag_wt_in_g: item.bag_wt_in_g || null,
            gross_wt_in_g: item.gross_wt_in_g || null,
            stone_wt_in_g: item.stone_wt_in_g || null,

            others: item.others || null,
            others_wt_in_g: item.others_wt_in_g || null,
            others_value: item.others_value || null,

            net_wt_in_g: item.net_wt_in_g || null,

            purchase_rate: item.purchase_rate || null,
            stone_rate: item.stone_rate || null,
            making_charge: item.making_charge || null,
            rate_per_g: item.rate_per_g || null,

            amount: item.amount || null,
            vendor_remarks: item.vendor_remarks || null,
            branch_id: quotationRequest.branch_id || updateData.branch_id || 1,
            created_by: updateData.created_by,
          },
          { transaction }
        );
      }

      const parentId = quotationItem.id;
      // ADDITIONAL MATERIALS
      // DELETE OLD
      await models.AdditionalMaterial.destroy({
        where: {
          parent_type: "quotation_item",
          parent_id: parentId,
        },
        force: true,
        transaction,
      });

      // INSERT NEW
      if (item.additional_materials?.length) {
        const materials = item.additional_materials.map((m) => ({
          parent_type: "quotation_item",
          parent_id: parentId,
          label: m.label,
          weight_in_g: m.weight_in_g || 0,
          value: m.value || 0,
        }));

        await models.AdditionalMaterial.bulkCreate(materials, {
          transaction,
        });
      }

      incomingIds.push(parentId);
    }

    // DELETE REMOVED ITEMS + MATERIALS
    const itemsToDelete = existingItems
      .filter((item) => !incomingIds.includes(item.id))
      .map((item) => item.id);

    if (itemsToDelete.length) {
      await models.QuotationItem.destroy({
        where: { id: itemsToDelete },        
        vendor_quotation_id: null,
        transaction,
      });

      await models.AdditionalMaterial.destroy({
        where: {
          parent_type: "quotation_item",
          parent_id: itemsToDelete,
        },
        force: true,
        transaction,
      });
    }

    // 5. Recalculate quotation status
    const newStatus = await calculateQuotationStatus(id, transaction);

    await quotationRequest.update(
      { status_id: newStatus },
      { transaction }
    );

    // 6. Fetch updated result
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
    const { page, limit, type = "sent", status_id, vendor_id, date, search, branch_id } = req.query;

    // --- Optional Pagination ---
    const isPaginated = page && limit;
    const parsedPage = isPaginated ? parseInt(page) : 1;
    const parsedLimit = isPaginated ? parseInt(limit) : null;
    const offset = isPaginated ? (parsedPage - 1) * parsedLimit : null;

    // --- Base WHERE clause for SENT list ---
    let whereSql = `WHERE q.deleted_at IS NULL`;
    const replacements = {};
    
    if (branch_id) {
      whereSql += ` AND q.branch_id = :branch_id`;
      replacements.branch_id = parseInt(branch_id);
    }

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

    if (date) {
      whereSql += ` AND q.request_date = :date`;
      replacements.date = date;
    }

    // SCORE CARDS (DYNAMIC & FILTER-AWARE)
    let sentWhereSql = `WHERE q.deleted_at IS NULL`;
    let receivedWhereSql = `WHERE vq.deleted_at IS NULL AND vq.status = 'accepted'`;
    const scoreReplacements = {};
    
    if (branch_id) {
      sentWhereSql += ` AND q.branch_id = :branch_id`;
      receivedWhereSql += ` AND q.branch_id = :branch_id`;
      scoreReplacements.branch_id = parseInt(branch_id);
    }

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

    if (date) {
      sentWhereSql += ` AND q.request_date = :date`;
      receivedWhereSql += ` AND q.request_date = :date`;
      scoreReplacements.date = date;
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
      
      if (branch_id) {
        vqWhereSql += ` AND q.branch_id = :branch_id`;
        vqReplacements.branch_id = parseInt(branch_id);
      }

      if (vendor_id) {
        vqWhereSql += ` AND vq.vendor_id = :vendor_id`;
        vqReplacements.vendor_id = parseInt(vendor_id);
      }

      if (search) {
        vqWhereSql += ` AND (q.qr_id ILIKE :search OR v.vendor_name ILIKE :search)`;
        vqReplacements.search = `%${search}%`;
      }

      if (date) {
        vqWhereSql += ` AND q.request_date = :date`;
        vqReplacements.date = date;
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
          vq.created_at,
          q.qr_id,
          q.request_date,
          q.expiry_date,
          q.status_id AS quotation_status_id,
          v.id AS vendor_id,
          v.vendor_name,
          v.vendor_image_url,
          STRING_AGG(sc.subcategory_name, ', ') AS item_details,
          
          COALESCE(SUM(qi.quantity), 0) AS total_quantity
        FROM vendor_quotations vq
        LEFT JOIN quotations q ON q.id = vq.quotation_id
        LEFT JOIN vendors v ON v.id = vq.vendor_id
        LEFT JOIN quotation_items qi 
          ON qi.vendor_quotation_id = vq.id 
          AND qi.deleted_at IS NULL
        LEFT JOIN subcategories sc ON sc.id = qi.subcategory_id
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

          STRING_AGG(sc.subcategory_name, ', ') AS item_details,

          -- FIXED TOTAL QUANTITY (NO DUPLICATION)
          COALESCE(qi_sum.total_quantity, 0) * COUNT(DISTINCT v.id) AS total_quantity,
          u.email AS created_by,

          COUNT(DISTINCT vq.id) FILTER (WHERE vq.status = 'pending') AS pending_vendors,
          COUNT(DISTINCT vq.id) FILTER (WHERE vq.status = 'received') AS received_vendors,
          COUNT(DISTINCT vq.id) AS total_vendors
        FROM quotations q
        LEFT JOIN vendors v ON v.id = ANY(q.vendor_ids)
        LEFT JOIN vendor_quotations vq ON vq.quotation_id = q.id AND vq.deleted_at IS NULL
        
        -- KEEP THIS ONLY FOR ITEM DETAILS (NOT FOR SUM)
        LEFT JOIN quotation_items qi 
          ON qi.quotation_id = q.id 
          AND qi.vendor_quotation_id IS NULL 
          AND qi.deleted_at IS NULL
        LEFT JOIN subcategories sc ON sc.id = qi.subcategory_id

        -- FIXED TOTAL QUANTITY (NO DUPLICATION)
        LEFT JOIN (
          SELECT
            quotation_id,
            SUM(quantity) AS total_quantity
          FROM quotation_items
          WHERE vendor_quotation_id IS NULL
            AND deleted_at IS NULL
          GROUP BY quotation_id
        ) qi_sum
          ON qi_sum.quotation_id = q.id

        LEFT JOIN users u ON u.id = q.created_by

        ${whereSql}

        GROUP BY q.id, u.email, qi_sum.total_quantity

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

const getQuotationComparisonById = async (req, res) => {
  try {
    const { quotation_id } = req.params;

    /** STEP 1: QUOTATION BASIC INFO */
    const quotationQuery = `
      SELECT id, qr_id, request_date, expiry_date
      FROM quotations
      WHERE id = :quotation_id AND deleted_at IS NULL
    `;

    const [quotation] = await sequelize.query(quotationQuery, {
      replacements: { quotation_id },
      type: sequelize.QueryTypes.SELECT,
    });

    if (!quotation) {
      return commonService.notFound(res, "Quotation not found");
    }

    /** STEP 2: ITEM MASTER (COMMON ITEMS) */
    const itemsQuery = `
      SELECT 
        qi.material_type_id,
        mt.material_type AS material_type,
        qi.category_id,
        ct.category_name,
        qi.subcategory_id,
        sc.subcategory_name,
        qi.purity,
        qi.quantity,
        qi.ref_no,
        qi.material_price_per_g,
        qi.type,
        qi.total_wt_in_g,
        qi.net_wt_in_g,
        qi.rate_per_g,
        qi.purchase_rate,
        qi.making_charge,
        qi.amount
      FROM quotation_items qi
      LEFT JOIN "materialTypes" mt
        ON mt.id = qi.material_type_id
        AND mt.deleted_at IS NULL
      LEFT JOIN categories ct
        ON ct.id = qi.category_id
        AND ct.deleted_at IS NULL
      LEFT JOIN subcategories sc
        ON sc.id = qi.subcategory_id
        AND sc.deleted_at IS NULL
      WHERE qi.quotation_id = :quotation_id
        AND qi.vendor_quotation_id IS NULL
        AND qi.deleted_at IS NULL
      ORDER BY qi.id ASC
    `;

    const items = await sequelize.query(itemsQuery, {
      replacements: { quotation_id },
      type: sequelize.QueryTypes.SELECT,
    });

    /** STEP 3: ACCEPTED VENDORS WITH PRICES */
    const vendorsQuery = `
      SELECT
        v.id AS vendor_id,
        v.vendor_name,
        qi.material_type_id,
        mt.material_type AS material_type,
        qi.category_id,
        ct.category_name,
        qi.subcategory_id,
        sc.subcategory_name,
        qi.purity,
        qi.quantity,
        qi.ref_no,
        qi.material_price_per_g,
        qi.type,
        qi.total_wt_in_g,
        qi.net_wt_in_g,
        qi.rate_per_g,
        qi.purchase_rate,
        qi.making_charge,
        qi.amount,
        vq.total_amount,
        vq.terms_and_conditions,
        vq.attachment_url
      FROM vendor_quotations vq
      JOIN vendors v ON v.id = vq.vendor_id
      JOIN quotation_items qi ON qi.vendor_quotation_id = vq.id
      LEFT JOIN "materialTypes" mt
        ON mt.id = qi.material_type_id
        AND mt.deleted_at IS NULL
      LEFT JOIN categories ct
        ON ct.id = qi.category_id
        AND ct.deleted_at IS NULL
      LEFT JOIN subcategories sc
        ON sc.id = qi.subcategory_id
        AND sc.deleted_at IS NULL
      WHERE vq.quotation_id = :quotation_id
        AND vq.status = 'accepted'
        AND vq.deleted_at IS NULL
        AND qi.deleted_at IS NULL
      ORDER BY v.vendor_name, qi.id ASC
    `;

    const vendorRows = await sequelize.query(vendorsQuery, {
      replacements: { quotation_id },
      type: sequelize.QueryTypes.SELECT,
    });

    /** STEP 4: GROUP BY VENDOR */
    const vendorsMap = {};
    vendorRows.forEach(row => {
      if (!vendorsMap[row.vendor_id]) {
        vendorsMap[row.vendor_id] = {
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          items: [],
          total_amount: row.total_amount,
        };
      }

      vendorsMap[row.vendor_id].items.push({
        material_type_id: row.material_type_id,
        material_type: row.material_type,
        category_id: row.category_id,
        category_name: row.category_name,
        subcategory_id: row.subcategory_id,
        subcategory_name: row.subcategory_name,
        product_description: row.product_description,
        purity: row.purity,
        weight: row.weight,
        quantity: row.quantity,
        rate: row.rate,
        amount: row.amount,
      });
    });

    return commonService.okResponse(res, {
      quotation,
      items,
      vendors: Object.values(vendorsMap),
    });

  } catch (error) {
    console.error("Error in getQuotationView:", error);
    return commonService.handleError(res, error);
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
        v.state_id,
        v.district_id,
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
      }
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
      }
    );

    // Get vendor-specific items (if vendor has submitted rates)
    const baseItemIds = baseItems.map((i) => i.id);

    let baseMaterialMap = {};
    if (baseItemIds.length) {
      const materials = await models.AdditionalMaterial.findAll({
        where: {
          parent_type: "quotation_item",
          parent_id: baseItemIds,
        },
        raw: true,
      });

      materials.forEach((m) => {
        if (!baseMaterialMap[m.parent_id]) {
          baseMaterialMap[m.parent_id] = [];
        }
        baseMaterialMap[m.parent_id].push(m);
      });
    }

    const enrichedBaseItems = baseItems.map((item) => ({
      ...item,
      additional_materials: baseMaterialMap[item.id] || [],
    }));

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

    // 👉 FETCH VENDOR ADDITIONAL MATERIALS
    const vendorItemIds = vendorItems.map((i) => i.id);

    let vendorMaterialMap = {};
    if (vendorItemIds.length) {
      const materials = await models.AdditionalMaterial.findAll({
        where: {
          parent_type: "quotation_item",
          parent_id: vendorItemIds,
        },
        raw: true,
      });

      materials.forEach((m) => {
        if (!vendorMaterialMap[m.parent_id]) {
          vendorMaterialMap[m.parent_id] = [];
        }
        vendorMaterialMap[m.parent_id].push(m);
      });
    }

    const enrichedVendorItems = vendorItems.map((item) => ({
      ...item,
      additional_materials: vendorMaterialMap[item.id] || [],
    }));

    return commonService.okResponse(res, {
      ...vq,
      base_items: enrichedBaseItems,
      vendor_items: enrichedVendorItems,
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

        ref_no: baseItem.ref_no,
        material_price_per_g: baseItem.material_price_per_g,
        purity: baseItem.purity,
        type: baseItem.type,
        quantity: baseItem.quantity,

        total_wt_in_g: baseItem.total_wt_in_g,
        bag_wt_in_g: baseItem.bag_wt_in_g,
        gross_wt_in_g: baseItem.gross_wt_in_g,
        stone_wt_in_g: baseItem.stone_wt_in_g,

        others: baseItem.others,
        others_wt_in_g: baseItem.others_wt_in_g,
        others_value: baseItem.others_value,

        net_wt_in_g: baseItem.net_wt_in_g,

        purchase_rate: item.purchase_rate || null,
        stone_rate: item.stone_rate || null,
        making_charge: item.making_charge || null,
        rate_per_g: item.rate_per_g || null,

        amount: item.amount || null,
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
    const { page, limit, status = "received", search, vendor_id, date, branch_id } = req.query;

    // vendor_id is REQUIRED
    if (!vendor_id) {
      return commonService.badRequest(res, "vendor_id is required");
    }

    const vendorId = parseInt(vendor_id);

    // --- Optional Pagination ---
    const isPaginated = page && limit;
    const parsedPage = isPaginated ? parseInt(page) : 1;
    const parsedLimit = isPaginated ? parseInt(limit) : null;
    const offset = isPaginated ? (parsedPage - 1) * parsedLimit : null;

    // BASE WHERE (vendor-only)
    let whereSql = `
      WHERE vq.deleted_at IS NULL
        AND vq.vendor_id = :vendor_id
    `;
    const replacements = { vendor_id: vendorId };
    
    if (branch_id) {
      whereSql += ` AND vq.branch_id = :branch_id`;
      replacements.branch_id = parseInt(branch_id);
    }

    // STATUS FILTER (CORRECTED)
    if (status === "received") {
      // Vendor inbox → admin created quotation
      whereSql += ` AND vq.status = 'pending'`;
    } else if (status === "sent") {
      // Vendor accepted / submitted
      whereSql += ` AND vq.status = 'accepted'`;
    } else if (status === "rejected") {
      // Vendor rejected
      whereSql += ` AND vq.status = 'rejected'`;
    }

    if (date) {
      whereSql += ` AND DATE(q.request_date) = :date`;
      replacements.date = date;
    }

    if (search) {
      whereSql += `
      AND (
        vq.vendor_quotation_number ILIKE :search
        OR q.qr_id ILIKE :search
        OR EXISTS (
          SELECT 1
          FROM quotation_items qi
          WHERE qi.quotation_id = q.id
            AND qi.vendor_quotation_id IS NULL
            AND qi.deleted_at IS NULL
        )
      )
    `;
      replacements.search = `%${search}%`;
    }

    // SCORE CARDS (MATCH DB + UI)
    const scoreCardQuery = `
      SELECT
        COUNT(*) FILTER (WHERE vq.status = 'pending')  AS received_count,
        COUNT(*) FILTER (WHERE vq.status = 'accepted') AS sent_count,
        COUNT(*) FILTER (WHERE vq.status = 'rejected') AS rejected_count
      FROM vendor_quotations vq
      WHERE vq.deleted_at IS NULL
        AND vq.vendor_id = :vendor_id;
    `;

    const [scoreCardResult] = await sequelize.query(scoreCardQuery, {
      replacements: { vendor_id: vendorId },
      type: sequelize.QueryTypes.SELECT,
    });

    const scoreCards = {
      received: Number(scoreCardResult.received_count || 0),
      sent: Number(scoreCardResult.sent_count || 0),
      rejected: Number(scoreCardResult.rejected_count || 0),
    };

    // TOTAL COUNT
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM vendor_quotations vq
      LEFT JOIN quotations q ON q.id = vq.quotation_id
      ${whereSql};
    `;

    const [countResult] = await sequelize.query(countQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const total = Number(countResult.total || 0);

    let dataQuery = `
      SELECT
        vq.id AS vendor_quotation_id,
        vq.quotation_id,
        vq.status,
        vq.response_date,
        vq.total_amount,
        vq.vendor_quotation_number,

        q.qr_id,
        q.request_date,
        q.expiry_date,

        STRING_AGG(sc.subcategory_name, ', ') AS item_details,
        COALESCE(SUM(qi.quantity), 0) AS quantity

      FROM vendor_quotations vq
      LEFT JOIN quotations q 
        ON q.id = vq.quotation_id

      LEFT JOIN quotation_items qi 
        ON qi.quotation_id = q.id
        AND qi.vendor_quotation_id IS NULL
        AND qi.deleted_at IS NULL

      LEFT JOIN subcategories sc ON sc.id = qi.subcategory_id

      ${whereSql}

      GROUP BY vq.id, q.id
      ORDER BY q.qr_id DESC, vq.id DESC
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
  getQuotationComparisonById,
  // Vendor-specific functions
  generateVendorQuotationCode,
  getVendorQuotationById,
  updateVendorQuotationStatus,
  submitVendorRates,
  getAllVendorQuotations,
};
