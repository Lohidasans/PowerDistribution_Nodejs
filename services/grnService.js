const { models, sequelize  } = require("../models");
const commonService = require("./commonService");
const { Op } = require("sequelize");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create GRN with items
const createGrn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { items = [], ...grnData } = req.body;
    const { 
      grn_no, 
      entity_type, 
      order_by_user_id, 
      branch_id 
    } = grnData;

    // Required validation
    const requiredFields = ["grn_no", "grn_date", "vendor_id"];
    for (const field of requiredFields) {
      if (!grnData[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    let validationBranchId = branch_id;
    if (
      entity_type === "superadmin" || 
      entity_type === "branch"
    ) {
      validationBranchId = order_by_user_id;
    }
    // Check if a non-deleted grn already uses this code
    const existing = await models.Grn.findOne({
      where: {
        grn_no,
        branch_id: validationBranchId,
        deleted_at: null,
      },
      transaction,
    });

    if (existing) {
      await transaction.rollback();
      return commonService.badRequest(res, {
        message: "Grn code already exists for this branch",
      });
    }

    // CREATE GRN
    const grn = await models.Grn.create(grnData, { transaction });

    // CREATE ITEMS + ADDITIONAL MATERIALS
    for (const item of items) {
      // 1️⃣ Create GRN Item
      const createdItem = await models.GrnItem.create(
        {
          ...item,
          grn_id: grn.id,
        },
        { transaction }
      );

      // 2️⃣ Handle Additional Materials (optional)
      if (item.additional_materials?.length) {
        const materials = item.additional_materials.map((m) => ({
          parent_type: "grn_item",
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

    await transaction.commit();

    const result = await getGrnWithItems(grn.id);
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error("GRN Create Error =>", error);
    return commonService.handleError(res, error);
  }
};

// Get GRN by ID with items
const getGrnById = async (req, res) => {
  try {
    const { id } = req.params;
    const grn = await getGrnWithItems(id);

    if (!grn) {
      return commonService.notFound(res, "GRN not found");
    }

    return commonService.okResponse(res, grn);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

const getGrnWithItems = async (grnId) => {
  try {
    const grn = await models.Grn.findByPk(grnId, {
      attributes: [
        "id",
        "grn_no",
        "grn_date",
        "grn_info_ids",
        "po_id",
        "vendor_id",
        "branch_id",
        "order_by_user_id",
        "reference_id",
        "gst_no",
        "billing_address",
        "shipping_address",
        "subtotal_amount",
        "sgst_percent",
        "cgst_percent",
        "discount_percent",
        "total_amount",
        "total_gross_wt_in_g",
        "remarks",
        "status_id",
        "is_active",
        "entity_type",
        "created_at",
        "updated_at",
      ],
      raw: true,
    });

    if (!grn) return null;

    // =========================
    // ITEMS
    // =========================
    const items = await sequelize.query(
      `
      SELECT
        gi.*,
        mt.material_type as material_type_name,
        c.category_name as category_name,
        sc.subcategory_name as subcategory_name
      FROM "grnItems" gi
      LEFT JOIN "materialTypes" mt ON gi.material_type_id = mt.id
      LEFT JOIN categories c ON gi.category_id = c.id
      LEFT JOIN subcategories sc ON gi.subcategory_id = sc.id
      WHERE gi.grn_id = :grnId
      ORDER BY gi.id ASC
      `,
      {
        replacements: { grnId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const itemIds = items.map((i) => i.id);

    // 🔥 FETCH MATERIALS
    const materials = await models.AdditionalMaterial.findAll({
      where: {
        parent_type: "grn_item",
        parent_id: itemIds,
      },
      raw: true,
    });

    const materialMap = {};
    materials.forEach((m) => {
      if (!materialMap[m.parent_id]) materialMap[m.parent_id] = [];
      materialMap[m.parent_id].push(m);
    });

    const enrichedItems = items.map((item) => ({
      ...item,
      additional_materials: materialMap[item.id] || [],
    }));

    // =========================
    // PURCHASE ORDER
    // =========================
    let purchaseOrder = null;
    if (grn.po_id) {
      purchaseOrder = await models.PurchaseOrder.findByPk(grn.po_id, {
        attributes: ["id", "po_no", "po_date"],
        raw: true,
      });
    }

    // =========================
    // VENDOR
    // =========================
    const vendor =
      (await models.Vendor.findByPk(grn.vendor_id, {
        attributes: ["id", "vendor_name"],
        raw: true,
      })) || {
        id: grn.vendor_id,
        vendor_name: "Vendor Not Found",
      };

    // =========================
    // USER
    // =========================
    let user = null;
    if (grn.order_by_user_id) {
      user = await models.User.findByPk(grn.order_by_user_id, {
        attributes: ["id", "email"],
        raw: true,
      });

      if (!user) {
        user = {
          id: grn.order_by_user_id,
          email: "User Not Found",
        };
      }
    }

    return {
      ...grn,
      purchase_order: purchaseOrder,
      vendor,
      order_by_user: user,
      items: enrichedItems,
    };
  } catch (error) {
    console.error("Error in getGrnWithItems:", error);
    throw error;
  }
};

// Update GRN and its items (upsert by item.id; do not destroy existing rows)
const updateGrn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { items = [], grn_no, ...updateData } = req.body;

    // ❌ Block GRN number update
    if (grn_no !== undefined) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "GRN number cannot be modified once created"
      );
    }

    // Find GRN
    const grn = await models.Grn.findByPk(id, { transaction });
    if (!grn) {
      await transaction.rollback();
      return commonService.notFound(res, "GRN not found");
    }

    // CHECK: Is GRN already used in products?
    const productExists = await models.Product.findOne({
      where: { grn_id: id },
      attributes: ["id"],
      transaction,
    });

    if (productExists) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "This GRN is already used in products and cannot be modified"
      );
    }

    // Update GRN header fields
    await grn.update(updateData, { transaction });

    // DELETE OLD MATERIALS FIRST
    const oldItems = await models.GrnItem.findAll({
      where: { grn_id: id },
      attributes: ["id"],
      raw: true,
      transaction,
    });

    const oldItemIds = oldItems.map((i) => i.id);

    if (oldItemIds.length) {
      await models.AdditionalMaterial.destroy({
        where: {
          parent_type: "grn_item",
          parent_id: oldItemIds,
        },
        force: true,
        transaction,
      });
    }

    // DELETE OLD ITEMS
    await models.GrnItem.destroy({
      where: { grn_id: id },
      force: true,
      transaction,
    });

    // CREATE NEW ITEMS + MATERIALS
    for (const item of items) {
      const createdItem = await models.GrnItem.create(
        {
          ...item,
          grn_id: id,
        },
        { transaction }
      );

      // ADDITIONAL MATERIALS
      if (item.additional_materials?.length) {
        const materials = item.additional_materials.map((m) => ({
          parent_type: "grn_item",
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

    await transaction.commit();
    const result = await getGrnWithItems(id);
    return commonService.okResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error("GRN Update Error =>", error);
    return commonService.handleError(res, error);
  }
};

// Delete GRN (soft delete)
const deleteGrn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const grn = await models.Grn.findByPk(id, { transaction });

    if (!grn) {
      await transaction.rollback();
      return commonService.notFound(res, "GRN not found");
    }

    // Soft delete GRN and its items
    await Promise.all([
      grn.destroy({ transaction }),
      models.GrnItem.destroy({
        where: { grn_id: id },
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

//List all Grns - with pagination
const getAllGrns = async (req, res) => {
  try {
    const {
      vendor_id,
      branch_id,
      start_date,
      end_date,
      search,
      status,
      page,
      limit,
    } = req.query;

    /* -----------------------------
       VALIDATION
    ----------------------------- */
    if (!branch_id) {
      return commonService.badRequest(res, {
        message: "branch_id is required",
      });
    }

    const isHeadOffice = parseInt(branch_id) === 1;

    const hasPagination = page && limit;
    const pageNumber = hasPagination ? parseInt(page) : null;
    const pageSize = hasPagination ? parseInt(limit) : null;
    const offset = hasPagination ? (pageNumber - 1) * pageSize : null;

    const replacements = { branch_id, isHeadOffice };

    //1. SUMMARY QUERY (NO STATUS FILTER)
    const summaryConditions = [`g.deleted_at IS NULL`];

    if (!isHeadOffice) {
      summaryConditions.push(`g.branch_id = :branch_id`);
    }

    if (vendor_id) {
      summaryConditions.push(`g.vendor_id = :vendor_id`);
      replacements.vendor_id = vendor_id;
    }

    if (start_date) {
      summaryConditions.push(`g.grn_date >= :start_date`);
      replacements.start_date = start_date;
    }

    if (end_date) {
      summaryConditions.push(`g.grn_date <= :end_date`);
      replacements.end_date = end_date;
    }

    const summaryWhere = `WHERE ${summaryConditions.join(" AND ")}`;

    const summaryQuery = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN g.status_id = 2 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN g.status_id = 1 THEN 1 ELSE 0 END) AS pending
      FROM grns g
      ${summaryWhere}
      AND (
        (:isHeadOffice = true)
        OR g.branch_id = :branch_id
      )
    `;

    const [summaryData] = await sequelize.query(summaryQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // 2. LIST QUERY (WITH STATUS FILTER)
    const whereConditions = [`g.deleted_at IS NULL`];

    if (!isHeadOffice) {
      whereConditions.push(`g.branch_id = :branch_id`);
    }

    if (vendor_id) {
      whereConditions.push(`g.vendor_id = :vendor_id`);
    }

    if (start_date) {
      whereConditions.push(`g.grn_date >= :start_date`);
    }

    if (end_date) {
      whereConditions.push(`g.grn_date <= :end_date`);
    }

    if (search) {
      whereConditions.push(
        `(g.grn_no ILIKE :search OR v.vendor_name ILIKE :search)`
      );
      replacements.search = `%${search}%`;
    }

    if (status === "completed") {
      whereConditions.push(`g.status_id = 2`);
    }

    if (status === "pending") {
      whereConditions.push(`g.status_id = 1`);
    }

    const whereSql = `WHERE ${whereConditions.join(" AND ")}`;

    const listRows = await sequelize.query(
      `
      SELECT
        g.id,
        g.grn_no,
        g.grn_date AS date,
        g.status_id,
        g.entity_type,
        g.remarks,
        g.is_active,

        v.id AS vendor_id,
        v.vendor_name,
        v.vendor_image_url,

        COALESCE(gi.total_order_weight, 0) AS ordered_weight,
        COALESCE(gi.total_order_qty, 0) AS ordered_qty,

        COALESCE(pi.total_updated_weight, 0) AS system_updated_weight,
        COALESCE(pi.total_updated_qty, 0) AS system_updated_qty,

        COALESCE(ga.adjustment_weight, 0) AS adjustment_weight,
        COALESCE(ga.adjustment_qty, 0) AS adjustment_qty,

        COALESCE(pret.returned_weight, 0) AS returned_weight,
        COALESCE(pret.returned_qty, 0) AS returned_qty,

        CASE
          WHEN g.entity_type = 'superadmin' THEN sp.company_name
          WHEN g.entity_type = 'branch' THEN b.branch_name
          WHEN g.entity_type = 'employee' THEN e.employee_name
          ELSE 'Unknown'
        END AS created_by,

        d.district_name AS location

      FROM grns g

      LEFT JOIN vendors v ON v.id = g.vendor_id

      LEFT JOIN superadmin_profiles sp
        ON sp.id = g.order_by_user_id AND g.entity_type = 'superadmin'

      LEFT JOIN branches b
        ON b.id = g.order_by_user_id AND g.entity_type = 'branch'

      LEFT JOIN employees e
        ON e.id = g.order_by_user_id AND g.entity_type = 'employee'

      LEFT JOIN districts d ON (
        (g.entity_type = 'superadmin' AND d.id = sp.district_id) OR
        (g.entity_type = 'branch' AND d.id = b.district_id)
      )

      -- ORDER WEIGHT
      LEFT JOIN (
        SELECT grn_id, SUM(gross_wt_in_g) AS total_order_weight, SUM(quantity) AS total_order_qty
        FROM "grnItems"
        WHERE deleted_at IS NULL
        GROUP BY grn_id
      ) gi ON gi.grn_id = g.id

      -- ✅ UPDATED WEIGHT(FIXED LOGIC)
      LEFT JOIN (
        SELECT
          p.grn_id,

          /* UPDATED WEIGHT */
           SUM(pid.quantity * pid.gross_weight)     --CURRENT STOCK
            + COALESCE(SUM(                    --OFFLINE BILL SOLD
              CASE
                WHEN sib.status = 'Invoice'
                THEN sii.quantity * sii.gross_weight
                ELSE 0
              END
            ),0)
          + COALESCE(SUM(oi.quantity * pid.gross_weight),0) AS total_updated_weight,   --ONLINE ORDER SOLD

          SUM(pid.quantity) + COALESCE(SUM(   --QTY
              CASE
                WHEN sib.status = 'Invoice'
                THEN sii.quantity
                ELSE 0
              END
            ),0) + COALESCE(SUM(oi.quantity),0) AS total_updated_qty

        FROM products p

        JOIN "productItemDetails" pid ON pid.product_id = p.id AND pid.deleted_at IS NULL
        LEFT JOIN sales_invoice_bill_items sii ON sii.product_item_detail_id = pid.id AND sii.deleted_at IS NULL AND sii.is_returned = false
        LEFT JOIN sales_invoice_bills sib ON sib.id = sii.invoice_bill_id AND sib.deleted_at IS NULL
        LEFT JOIN order_items oi ON oi.product_item_id = pid.id AND oi.deleted_at IS NULL AND oi.item_status != 'Cancelled'
        
        WHERE p.deleted_at IS NULL

        GROUP BY p.grn_id
      ) pi ON pi.grn_id = g.id

      /* ADJUSTMENTS */
      LEFT JOIN (
        SELECT
          grn_id,
          SUM(adjustment_weight_in_g) AS adjustment_weight,
          SUM(adjustment_quantity) AS adjustment_qty
        FROM grn_adjustments
        WHERE deleted_at IS NULL
        GROUP BY grn_id
      ) ga ON ga.grn_id = g.id

      /* PURCHASE RETURNS (per GRN) — returned to vendor, so this portion of the
         ordered GRN will never become stock; subtracted from yet-to-update below.
         Gross weight to match ordered_weight = SUM(gross_wt_in_g). */
      LEFT JOIN (
        SELECT
          pr.grn_id,
          SUM(pri.gross_weight) AS returned_weight,
          SUM(pri.quantity) AS returned_qty
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.pr_id AND pr.deleted_at IS NULL
        WHERE pri.deleted_at IS NULL
        GROUP BY pr.grn_id
      ) pret ON pret.grn_id = g.id

      ${whereSql}

      ORDER BY g.created_at DESC, g.id DESC
      `,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const transformedRows = listRows.map((row) => {
      const orderedWeight = parseFloat(row.ordered_weight) || 0;
      const orderedQty = parseInt(row.ordered_qty) || 0;

      const updatedWeight =
        parseFloat(row.system_updated_weight) || 0;

      const updatedQty =
        parseInt(row.system_updated_qty) || 0;

      const adjustmentWeight =
        parseFloat(row.adjustment_weight) || 0;

      const adjustmentQty =
        parseInt(row.adjustment_qty) || 0;

      const returnedWeight =
        parseFloat(row.returned_weight) || 0;

      const returnedQty =
        parseInt(row.returned_qty) || 0;

      // Returned-to-vendor quantities never become stock, so they are excluded
      // from what's still "yet to update" into products.
      const yetToUpdateWeight = orderedWeight - updatedWeight - returnedWeight;
      const yetToUpdateQty = orderedQty - updatedQty - returnedQty;

      return {
        id: row.id,
        grn_no: row.grn_no,
        is_active: row.is_active,
        date: row.date,

        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        vendor_image_url: row.vendor_image_url,

        created_by: row.created_by,
        location: row.location,
        remarks: row.remarks,

        status_id: row.status_id,
        status: row.status_id === 2 ? "Completed" : "Pending",

        ordered_weight: +orderedWeight.toFixed(3),
        ordered_qty: orderedQty,

        updated_weight: +updatedWeight.toFixed(3),
        updated_qty: updatedQty,

        yet_to_update_weight: +yetToUpdateWeight.toFixed(3),
        yet_to_update_qty: yetToUpdateQty,

        adjustment_weight: +adjustmentWeight.toFixed(3),
        adjustment_qty: adjustmentQty,

        returned_weight: +returnedWeight.toFixed(3),
        returned_qty: returnedQty,
      };
    });

    // Pagination
    let finalData = transformedRows;
    let pagination = null;

    if (hasPagination) {
      const totalItems = transformedRows.length;

      finalData = transformedRows.slice(
        offset,
        offset + pageSize
      );

      pagination = {
        page: pageNumber,
        limit: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      };
    }

    return commonService.okResponse(res, {
      summary: {
        totalGrns: parseInt(summaryData.total) || 0,
        completed: parseInt(summaryData.completed) || 0,
        pending: parseInt(summaryData.pending) || 0,
      },
      pagination,
      data: finalData,
    });
  } catch (error) {
    console.error("getAllGrns Error:", error);
    return commonService.handleError(res, error);
  }
};

// GET: list of GRN numbers with full ProductGrnInfo + joined details
const listGrnNumbers = async (req, res) => {
  try {
    const { vendor_id } = req.query;
    // Base condition: only active GRNs
    const whereCondition = {
      is_active: true,
    };

    // Optional vendor filter
    if (vendor_id) {
      whereCondition.vendor_id = vendor_id;
    }

    // 1.Fetch filtered GRNs
    const grns = await models.Grn.findAll({
      where: whereCondition,
      attributes: ["id", "grn_no", "grn_date", "vendor_id"],
      order: [["created_at", "DESC"]],
      raw: true,
    });

    if (grns.length === 0) {
      return commonService.okResponse(res, { grns: [] });
    }

    const grnIds = grns.map((g) => g.id);

    // 2.Fetch all grnItems for these GRNs, along with how much of each line has
    //   already been purchase-returned to the vendor (qty + weights). We do NOT
    //   subtract product-conversion here: a GRN line can be split into several
    //   products, and each consuming form (Product create / Purchase Return)
    //   already tracks its own product usage — subtracting it here too would
    //   double-count. This endpoint's job is only to reflect RETURNED stock.
    const grnItems = await sequelize.query(
      `SELECT
        gi.*,
        mt.material_type AS material_type_name,
        c.category_name,
        sc.subcategory_name,
        COALESCE(ret.returned_qty, 0)        AS returned_qty,
        COALESCE(ret.returned_net_wt, 0)     AS returned_net_wt,
        COALESCE(ret.returned_gross_wt, 0)   AS returned_gross_wt
      FROM "grnItems" gi
      LEFT JOIN "materialTypes" mt ON gi.material_type_id = mt.id
      LEFT JOIN categories c ON gi.category_id = c.id
      LEFT JOIN subcategories sc ON gi.subcategory_id = sc.id
      LEFT JOIN LATERAL (
        SELECT
          SUM(pri.quantity)     AS returned_qty,
          SUM(pri.net_weight)   AS returned_net_wt,
          SUM(pri.gross_weight) AS returned_gross_wt
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.pr_id
        WHERE pr.grn_id = gi.grn_id
          AND (pri.grn_item_id = gi.id
               OR (pri.grn_item_id IS NULL AND pri.ref_no = gi.ref_no))
          AND pri.deleted_at IS NULL
          AND pr.deleted_at IS NULL
      ) ret ON TRUE
      WHERE gi.grn_id IN (:grnIds)
        AND gi.deleted_at IS NULL
      ORDER BY gi.id`,
      {
        replacements: { grnIds },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const WEIGHT_EPSILON = 0.001;

    // 3.Reduce each line by what has been returned, and drop fully-returned lines
    //   so neither the Purchase Return nor the Product "Ref No" dropdown offers
    //   stock that is already back with the vendor. The remaining fraction scales
    //   the qty-less weight/amount fields (total/bag/stone/others) proportionally.
    const groupedItems = {};
    grnItems.forEach((item) => {
      const origQty = Number(item.quantity) || 0;
      const origNet = Number(item.net_wt_in_g) || 0;
      const origGross = Number(item.gross_wt_in_g) || 0;
      const retQty = Number(item.returned_qty) || 0;
      const retNet = Number(item.returned_net_wt) || 0;
      const retGross = Number(item.returned_gross_wt) || 0;

      const remainingQty = origQty - retQty;
      const remainingNet = origNet - retNet;
      const remainingGross = origGross - retGross;

      // Piece lines are bounded by quantity; weight lines (qty 0/null) by net wt.
      const isFullyReturned = origQty > 0
        ? remainingQty <= 0
        : remainingNet <= WEIGHT_EPSILON;
      if (isFullyReturned) return;

      // Proportional factor for the fields that have no direct return counterpart.
      const factor = origQty > 0
        ? Math.max(0, remainingQty) / origQty
        : (origNet > 0 ? Math.max(0, remainingNet) / origNet : 1);
      const scale = (v) => +(((Number(v) || 0) * factor).toFixed(4));

      const remainingItem = {
        ...item,
        quantity: origQty > 0 ? Math.max(0, remainingQty) : origQty,
        net_wt_in_g: Math.max(0, remainingNet),
        gross_wt_in_g: Math.max(0, remainingGross),
        total_wt_in_g: scale(item.total_wt_in_g),
        bag_wt_in_g: scale(item.bag_wt_in_g),
        stone_wt_in_g: scale(item.stone_wt_in_g),
        others_wt_in_g: scale(item.others_wt_in_g),
        others_value: scale(item.others_value),
        total_amount: scale(item.total_amount),
      };

      if (!groupedItems[item.grn_id]) groupedItems[item.grn_id] = [];
      groupedItems[item.grn_id].push(remainingItem);
    });

    // 4.Attach items
    const enrichedGrns = grns.map((grn) => ({
      ...grn,
      grn_info_ids: groupedItems[grn.id] || [],
    }));

    return commonService.okResponse(res, { grns: enrichedGrns });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateGrnCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Grn,
      "grn_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { grn_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Detailed view for GRN page (joins: vendor + location + item master names)
const getGrnView = async (req, res) => {
  try {
    const { id } = req.params;

    // Header + vendor + location names
    const [headerRows] = await sequelize.query(
      `
        SELECT
          g.id,
          g.grn_no,
          g.grn_date,
          g.reference_id,
          g.subtotal_amount,
          g.sgst_percent,
          g.cgst_percent,
          g.discount_percent,
          g.total_amount,
          g.total_gross_wt_in_g,
          g.remarks,
          g.gst_no,
          g.billing_address,
          g.shipping_address,
          g.entity_type,
          g.created_at,
          g.updated_at,
          po.po_no,
          po.po_date,
          v.id               AS vendor_id,
          v.vendor_name,
          v.address          AS vendor_address,
          v.mobile           AS vendor_mobile,
          v.gst_no           AS vendor_gst_no,
          d.district_name    AS vendor_district,
          s.state_name       AS vendor_state,
          c.country_name     AS vendor_country,
          g.branch_id,
          br.branch_name     AS branch_name,
          br.address         AS branch_address,
          br.mobile          AS branch_mobile,
          br.gst_no          AS branch_gst_no,
          br.pin_code        AS branch_pin_code,
          bd.district_name   AS branch_district,
          bs.state_name      AS branch_state
        FROM grns g
        LEFT JOIN vendors v   ON v.id = g.vendor_id
        LEFT JOIN purchase_orders po ON po.id = g.po_id
        LEFT JOIN districts d ON d.id = v.district_id
        LEFT JOIN states s    ON s.id = v.state_id
        LEFT JOIN countries c ON c.id = v.country_id
        LEFT JOIN branches br ON br.id = g.branch_id
        LEFT JOIN districts bd ON bd.id = br.district_id
        LEFT JOIN states bs   ON bs.id = br.state_id
        WHERE g.id = :id
        LIMIT 1;
      `,
      { replacements: { id } }
    );

    if (!headerRows || headerRows.length === 0) {
      return commonService.notFound(res, "GRN not found");
    }

    // Items with material/category/subcategory names
    const [items] = await sequelize.query(
      `
        SELECT
          gi.*,
          mt.material_type   AS material_type_name,
          c.category_name    AS category_name,
          sc.subcategory_name AS subcategory_name
        FROM "grnItems" gi
        LEFT JOIN "materialTypes" mt ON gi.material_type_id = mt.id
        LEFT JOIN categories c       ON gi.category_id = c.id
        LEFT JOIN subcategories sc   ON gi.subcategory_id = sc.id
        WHERE gi.grn_id = :id AND gi.deleted_at IS NULL
        ORDER BY gi.id ASC;
      `,
      { replacements: { id } }
    );

    return commonService.okResponse(res, {
      header: headerRows[0],
      items,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getAllGrnInfos = async (req, res) => {
  try {
    const {
      ref_no,
      material_type_id,
      category_id,
      subcategory_id,
      page = 1,
      limit = 10,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build dynamic WHERE clause
    let whereSql = "WHERE gi.deleted_at IS NULL";
    const replacements = { limit: parseInt(limit), offset };

    if (material_type_id) {
      whereSql += " AND gi.material_type_id = :material_type_id";
      replacements.material_type_id = material_type_id;
    }
    if (category_id) {
      whereSql += " AND gi.category_id = :category_id";
      replacements.category_id = category_id;
    }
    if (subcategory_id) {
      whereSql += " AND gi.subcategory_id = :subcategory_id";
      replacements.subcategory_id = subcategory_id;
    }
    if (ref_no) {
      whereSql += " AND gi.ref_no = :ref_no";
      replacements.ref_no = ref_no;
    }

    // Count total
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM "grnItems" gi
      ${whereSql};
    `;
    const [countRows] = await sequelize.query(countQuery, { replacements });
    const total = parseInt(countRows?.[0]?.total || 0, 10);

    // Get data with joins
    const dataQuery = `
      SELECT
        gi.*,
        mt.material_type AS material_type_name,
        c.category_name,
        sc.subcategory_name
      FROM "grnItems" gi
      LEFT JOIN "materialTypes" mt ON gi.material_type_id = mt.id
      LEFT JOIN categories c ON gi.category_id = c.id
      LEFT JOIN subcategories sc ON gi.subcategory_id = sc.id
      ${whereSql}
      ORDER BY gi.id DESC
      LIMIT :limit OFFSET :offset;
    `;

    const [rows] = await sequelize.query(dataQuery, { replacements });

    return commonService.okResponse(res, {
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: rows,
    });
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Export GRN items to Excel with the columns:
// Date / Vendor Name / GRN No. / Ref No. / Material Type / Purity /
// Category / Sub Category / Type / Qty / Grs Wt. / Net Wt. /
// Purchase Rate / Making Charge / Rate Per g / Total Amount
const exportGrnReport = async (req, res) => {
  try {
    const ExcelJS = require("exceljs");

    const {
      vendor_id,
      branch_id,
      start_date,
      end_date,
      material_type_id,
      category_id,
      subcategory_id,
    } = req.query;

    const replacements = {};
    const whereConditions = [
      `g.deleted_at IS NULL`,
      `gi.deleted_at IS NULL`,
    ];

    if (vendor_id) {
      whereConditions.push(`g.vendor_id = :vendor_id`);
      replacements.vendor_id = parseInt(vendor_id);
    }
    if (branch_id) {
      whereConditions.push(`g.branch_id = :branch_id`);
      replacements.branch_id = parseInt(branch_id);
    }
    if (start_date) {
      whereConditions.push(`g.grn_date >= :start_date`);
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereConditions.push(`g.grn_date <= :end_date`);
      replacements.end_date = end_date;
    }
    if (material_type_id) {
      whereConditions.push(`gi.material_type_id = :material_type_id`);
      replacements.material_type_id = parseInt(material_type_id);
    }
    if (category_id) {
      whereConditions.push(`gi.category_id = :category_id`);
      replacements.category_id = parseInt(category_id);
    }
    if (subcategory_id) {
      whereConditions.push(`gi.subcategory_id = :subcategory_id`);
      replacements.subcategory_id = parseInt(subcategory_id);
    }

    const whereSql = `WHERE ${whereConditions.join(" AND ")}`;

    const rows = await sequelize.query(
      `SELECT
         g.grn_date          AS "Date",
         v.vendor_name       AS "Vendor Name",
         g.grn_no            AS "GRN No",
         gi.ref_no           AS "Ref No",
         mt.material_type    AS "Material Type",
         gi.purity           AS "Purity",
         c.category_name     AS "Category",
         sc.subcategory_name AS "Sub Category",
         gi.type             AS "Type",
         gi.quantity         AS "Qty",
         gi.gross_wt_in_g    AS "Grs Wt",
         gi.net_wt_in_g      AS "Net Wt",
         gi.purchase_rate    AS "Purchase Rate",
         gi.making_charge    AS "Making Charge",
         gi.rate_per_g       AS "Rate Per g",
         gi.total_amount     AS "Total Amount"
       FROM grns g
       LEFT JOIN vendors v           ON v.id = g.vendor_id
       INNER JOIN "grnItems" gi      ON gi.grn_id = g.id
       LEFT JOIN "materialTypes" mt  ON mt.id = gi.material_type_id
       LEFT JOIN categories c        ON c.id = gi.category_id
       LEFT JOIN subcategories sc    ON sc.id = gi.subcategory_id
       ${whereSql}
       ORDER BY g.grn_date DESC, g.grn_no, gi.id`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    // ── Build Workbook ──────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PowerDistribution";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("GRN Report");

    sheet.columns = [
      { header: "Date",          key: "Date",          width: 14 },
      { header: "Vendor Name",   key: "Vendor Name",   width: 24 },
      { header: "GRN No.",       key: "GRN No",        width: 16 },
      { header: "Ref No.",       key: "Ref No",        width: 16 },
      { header: "Material Type", key: "Material Type", width: 16 },
      { header: "Purity",        key: "Purity",        width: 10 },
      { header: "Category",      key: "Category",      width: 20 },
      { header: "Sub Category",  key: "Sub Category",  width: 20 },
      { header: "Type",          key: "Type",          width: 10 },
      { header: "Qty",           key: "Qty",           width: 8  },
      { header: "Grs Wt.",       key: "Grs Wt",        width: 12 },
      { header: "Net Wt.",       key: "Net Wt",        width: 12 },
      { header: "Purchase Rate", key: "Purchase Rate", width: 16 },
      { header: "Making Charge", key: "Making Charge", width: 16 },
      { header: "Rate Per g",    key: "Rate Per g",    width: 14 },
      { header: "Total Amount",  key: "Total Amount",  width: 16 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border    = {
        top:    { style: "thin" }, bottom: { style: "thin" },
        left:   { style: "thin" }, right:  { style: "thin" },
      };
    });

    // Data rows
    rows.forEach((row) => {
      const r = sheet.addRow(row);
      r.height = 18;
      r.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { vertical: "middle" };
        cell.border    = {
          top:    { style: "hair" }, bottom: { style: "hair" },
          left:   { style: "hair" }, right:  { style: "hair" },
        };
      });
    });

    // Totals row
    if (rows.length > 0) {
      const sumGrsWt       = rows.reduce((s, r) => s + (parseFloat(r["Grs Wt"])       || 0), 0);
      const sumNetWt       = rows.reduce((s, r) => s + (parseFloat(r["Net Wt"])       || 0), 0);
      const sumTotalAmount = rows.reduce((s, r) => s + (parseFloat(r["Total Amount"]) || 0), 0);

      const totalRow = sheet.addRow({
        "Date":         "TOTAL",
        "Grs Wt":       parseFloat(sumGrsWt.toFixed(4)),
        "Net Wt":       parseFloat(sumNetWt.toFixed(4)),
        "Total Amount": parseFloat(sumTotalAmount.toFixed(2)),
      });
      totalRow.height = 20;
      totalRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font      = { bold: true, size: 11 };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
        cell.alignment = { vertical: "middle" };
        cell.border    = {
          top:    { style: "thin" }, bottom: { style: "thin" },
          left:   { style: "thin" }, right:  { style: "thin" },
        };
      });
    }

    // Stream response
    const fileName = `GRN_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportGrnReport Error:", error);
    return commonService.handleError(res, error);
  }
};

const updateGrnStatus = async (req, res) => {
  const { grn_id } = req.params;
  const { is_active } = req.body;  
  const t = await sequelize.transaction();

  try {
    // 1. Check GRN exists
    const grn = await models.Grn.findOne({
      where: { id: grn_id },
      transaction: t,
    });

    if (!grn) {
      await t.rollback();
      return commonService.notFound(res, "GRN not found");
    }

    // 2. Check if products exist for this GRN
    if (is_active === false) {
      const productCount = await models.Product.count({
        where: { grn_id },
        transaction: t,
      });

      if (productCount > 0) {
        await t.rollback();
        return commonService.badRequest(
          res,
          "Cannot deactivate GRN because products exist for this GRN"
        );
      }
    }

    // 3️. Update is_active field
    await models.Grn.update({ is_active },
      {
        where: { id: grn_id },
        transaction: t,
      }
    )
    await t.commit();

    return commonService.okResponse(res, `GRN ${is_active ? "activated" : "deactivated"} successfully`);
  } catch (err) {
    await t.rollback();
    console.error(err);
    return commonService.handleError(res, err);
  }
};

const completeGrn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { grn_id } = req.params;

    const {
      adjustment_weight_in_g = 0,
      adjustment_quantity = 0,
      adjustment_type = "MANUAL",
      remarks,
      completed_by,
      branch_id
    } = req.body;

    if (!remarks) {
      await transaction.rollback();
      return commonService.badRequest(res, {
        message: "remarks is required"
      });
    }

    const grn = await models.Grn.findOne({
      where: {
        id: grn_id,
        deleted_at: null
      },
      transaction
    });

    if (!grn) {
      await transaction.rollback();
      return commonService.badRequest(res, {
        message: "GRN not found"
      });
    }

    if (grn.status_id === 2) {
      await transaction.rollback();
      return commonService.badRequest(res, {
        message: "GRN already completed"
      });
    }

    await models.GrnAdjustment.create(
      {
        grn_id,
        adjustment_weight_in_g,
        adjustment_quantity,
        adjustment_type,
        remarks,
        completed_by,
        branch_id
      },
      { transaction }
    );

    await models.Grn.update(
      {
        status_id: 2,
        remarks
      },
      {
        where: { id: grn_id },
        transaction
      }
    );

    await transaction.commit();

    return commonService.okResponse(res, {
      message: "GRN completed successfully"
    });

  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

const getCompleteGrnDetails = async (req, res) => {
  try {
    const { grn_id } = req.params;
    const { branch_id } = req.query;

    if (!grn_id) {
      return commonService.badRequest(res, {
        message: "grn_id is required"
      });
    }

    if (!branch_id) {
      return commonService.badRequest(res, {
        message: "branch_id is required"
      });
    }

    const isHeadOffice = parseInt(branch_id) === 1;

    const [row] = await sequelize.query(
      `
      SELECT
        g.id,
        g.grn_no,
        g.grn_date,
        g.status_id,

        v.id AS vendor_id,
        v.vendor_name,
        v.vendor_code,
        v.vendor_image_url,
        v.mobile,
        v.gst_no,
        v.address,
        v.pin_code,

        s.state_name,
        d.district_name,

        COALESCE(gi.ordered_weight, 0) AS ordered_weight,
        COALESCE(gi.ordered_qty, 0) AS ordered_qty,

        COALESCE(pi.updated_weight, 0) AS updated_weight,
        COALESCE(pi.updated_qty, 0) AS updated_qty,

        COALESCE(ga.adjustment_weight, 0) AS adjustment_weight,
        COALESCE(ga.adjustment_qty, 0) AS adjustment_qty,

        COALESCE(pret.returned_weight, 0) AS returned_weight,
        COALESCE(pret.returned_qty, 0) AS returned_qty

      FROM grns g

      LEFT JOIN vendors v
        ON v.id = g.vendor_id
       AND v.deleted_at IS NULL

      LEFT JOIN states s
        ON s.id = v.state_id

      LEFT JOIN districts d
        ON d.id = v.district_id

      /* ORDERED */
      LEFT JOIN (
        SELECT
          grn_id,
          SUM(gross_wt_in_g) AS ordered_weight,
          SUM(quantity) AS ordered_qty
        FROM "grnItems"
        WHERE deleted_at IS NULL
        GROUP BY grn_id
      ) gi ON gi.grn_id = g.id

      /* UPDATED */
      LEFT JOIN (
        SELECT
          p.grn_id,

          /* WEIGHT */
          SUM(pid.quantity * pid.gross_weight) + COALESCE(SUM(
              CASE
                WHEN sib.status = 'Invoice'
                THEN sii.quantity * sii.gross_weight
                ELSE 0
              END
            ),0) + COALESCE(SUM(oi.quantity * pid.gross_weight),0) AS updated_weight,

          /* QTY */
          SUM(pid.quantity) + COALESCE(SUM(
              CASE
                WHEN sib.status = 'Invoice'
                THEN sii.quantity
                ELSE 0
              END
            ),0) + COALESCE(SUM(oi.quantity),0) AS updated_qty

        FROM products p

        JOIN "productItemDetails" pid
          ON pid.product_id = p.id
        AND pid.deleted_at IS NULL

        LEFT JOIN sales_invoice_bill_items sii
          ON sii.product_item_detail_id = pid.id
        AND sii.deleted_at IS NULL
        AND sii.is_returned = false

        LEFT JOIN sales_invoice_bills sib
          ON sib.id = sii.invoice_bill_id
        AND sib.deleted_at IS NULL

        LEFT JOIN order_items oi
          ON oi.product_item_id = pid.id
        AND oi.deleted_at IS NULL
        AND oi.item_status != 'Cancelled'

        WHERE p.deleted_at IS NULL
          AND (
            (:isHeadOffice = true)
            OR p.branch_id = :branch_id
          )

        GROUP BY p.grn_id
      ) pi ON pi.grn_id = g.id

      /* ADJUSTMENT */
      LEFT JOIN (
        SELECT
          grn_id,
          SUM(adjustment_weight_in_g) AS adjustment_weight,
          SUM(adjustment_quantity) AS adjustment_qty
        FROM grn_adjustments
        WHERE deleted_at IS NULL
        GROUP BY grn_id
      ) ga ON ga.grn_id = g.id

      /* PURCHASE RETURNS (per GRN) — returned to vendor, so this portion of the
         ordered GRN never becomes stock; subtracted from yet-to-update below.
         Gross weight to match ordered_weight = SUM(gross_wt_in_g). */
      LEFT JOIN (
        SELECT
          pr.grn_id,
          SUM(pri.gross_weight) AS returned_weight,
          SUM(pri.quantity) AS returned_qty
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.pr_id AND pr.deleted_at IS NULL
        WHERE pri.deleted_at IS NULL
        GROUP BY pr.grn_id
      ) pret ON pret.grn_id = g.id

      WHERE g.id = :grn_id
        AND g.deleted_at IS NULL
      `,
      {
        replacements: {
          grn_id,
          branch_id,
          isHeadOffice
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!row) {
      return commonService.badRequest(res, {
        message: "GRN not found"
      });
    }

    const orderedWeight = parseFloat(row.ordered_weight) || 0;
    const orderedQty = parseInt(row.ordered_qty) || 0;

    const updatedWeight =
      (parseFloat(row.updated_weight) || 0) +
      (parseFloat(row.adjustment_weight) || 0);

    const updatedQty =
      (parseInt(row.updated_qty) || 0) +
      (parseInt(row.adjustment_qty) || 0);

    const returnedWeight = parseFloat(row.returned_weight) || 0;
    const returnedQty = parseInt(row.returned_qty) || 0;

    // Returned-to-vendor quantities never become stock, so they are excluded
    // from what's still "yet to update" into products.
    const yetToUpdateWeight =
      Math.max(0, orderedWeight - updatedWeight - returnedWeight);

    const yetToUpdateQty =
      Math.max(0, orderedQty - updatedQty - returnedQty);

    return commonService.okResponse(res, {
      data: {
        grn_id: row.id,
        grn_no: row.grn_no,
        grn_date: row.grn_date,
        status_id: row.status_id,

        vendor: {
          id: row.vendor_id,
          vendor_name: row.vendor_name,
          vendor_code: row.vendor_code,
          vendor_image_url: row.vendor_image_url,
          mobile: row.mobile,
          gst_no: row.gst_no,
          address: row.address,
          district_name: row.district_name,
          state_name: row.state_name,
          pin_code: row.pin_code
        },

        ordered: {
          weight: +orderedWeight.toFixed(3),
          quantity: orderedQty
        },

        updated: {
          weight: +updatedWeight.toFixed(3),
          quantity: updatedQty
        },

        returned: {
          weight: +returnedWeight.toFixed(3),
          quantity: returnedQty
        },

        yet_to_update: {
          weight: +yetToUpdateWeight.toFixed(3),
          quantity: yetToUpdateQty
        }
      }
    });

  } catch (error) {
    console.error("getCompleteGrnDetails Error:", error);
    return commonService.handleError(res, error);
  }
};

// Get vendor details in Grn Create Page
const getVendorSummary = async (req, res) => {
  try {
    const { vendor_id } = req.params;

    if (!vendor_id) {
      return res.status(400).json({ message: "vendor_id is required" });
    }

    // ✅ 1. Get Vendor
    const vendor = await models.Vendor.findOne({
      where: { id: vendor_id },
      attributes: [
        "id",
        "vendor_name",
        "mobile",
        "gst_no",
        "address",
        "state_id",
        "district_id"
      ],
      raw: true
    });

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // ✅ 2. Get State & District manually
    const state = await models.State.findOne({
      where: { id: vendor.state_id },
      attributes: ["state_name"],
      raw: true
    });

    const district = await models.District.findOne({
      where: { id: vendor.district_id },
      attributes: ["district_name"],
      raw: true
    });

    // attach manually
    vendor.state = state || null;
    vendor.district = district || null;

    // ✅ 3. Get all GRNs
    const grns = await models.Grn.findAll({
      where: {
        vendor_id,
        is_active: true
      },
      attributes: ["id", "grn_no", "total_amount"],
      raw: true
    });

    const grnIds = grns.map(g => String(g.id));

    // ✅ 4. Get Payments grouped by bill_no (IMPORTANT OPTIMIZATION)
    const payments = await models.VendorPayment.findAll({
      where: {
        purchase_id: grnIds,
        account_name_id: vendor_id,
        user_type_id: 1,
        bill_type_id: 1,
        status: "Completed",
        is_active: true
      },
      attributes: [
        "purchase_id",
        [sequelize.fn("SUM", sequelize.col("amount")), "paid"]
      ],
      group: ["purchase_id"],
      raw: true
    });
    // Convert to map for fast lookup
    const paymentMap = {};
    payments.forEach(p => {
      paymentMap[Number(p.purchase_id)] = parseFloat(p.paid);
    });

    // ✅ 5. Prepare GRN-wise data
    const grnData = grns.map(grn => {
      const total = parseFloat(grn.total_amount || 0);
      const paid = paymentMap[grn.id] || 0;
      const due = total - paid;

      return {
        grn_id: grn.id,
        grn_no: grn.grn_no,
        total_purchase: total,
        paid,
        due
      };
    });

    // ✅ 6. Totals
    const total_purchase = grnData.reduce((sum, g) => sum + g.total_purchase, 0);
    const total_paid = grnData.reduce((sum, g) => sum + g.paid, 0);
    const total_due = total_purchase - total_paid;

    return commonService.okResponse(res, {
      success: true,
      data: {
        vendor,
        transaction_details: {
          total_purchase,
          paid: total_paid,
          due: total_due
        },
        grn_wise: grnData
      }
    });

  } catch (error) {
    console.error("getVendorSummary Error:", error);
    return commonService.handleError(res, error);
  }
};

module.exports = {
  createGrn,
  getGrnById,
  updateGrn,
  deleteGrn,
  getAllGrns,
  listGrnNumbers,
  generateGrnCode,
  getGrnView,
  getAllGrnInfos,
  updateGrnStatus,
  exportGrnReport,
  completeGrn,
  getCompleteGrnDetails,
  getVendorSummary
};