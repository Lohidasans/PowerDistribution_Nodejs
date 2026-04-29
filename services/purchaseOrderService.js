const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create Purchase Order
const createPurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items = [], ...header } = req.body || {};

    // Validation
    const required = ["po_no", "po_date", "vendor_id", "order_by_user_id"];
    for (const f of required) {
      if (!header[f]) {
        await t.rollback();
        return commonService.badRequest(res, `${f} is required`);
      }
    }

    // Duplicate check
    const existing = await models.PurchaseOrder.findOne({
      where: {
        po_no: header.po_no,
        deleted_at: null,
      },
    });

    if (existing) {
      await t.rollback();
      return commonService.badRequest(res, {
        message: "Purchase order number already exists",
      });
    }

    // Decide status
    const status_id = header.entity_type === "superadmin" ? 2 : 1;

    // ✅ CREATE PO FIRST
    const po = await models.PurchaseOrder.create(
      {
        ...header,
        status_id,
      },
      { transaction: t }
    );

    // Create PO Items
    if (Array.isArray(items) && items.length > 0) {
      const rows = items.map((it) => ({ ...it, po_id: po.id }));
      await models.PurchaseOrderItem.bulkCreate(rows, { transaction: t });
    }

    // ✅ Now create Sales Order if approved
    if (Number(status_id) === 2) {
      const existingSO = await models.SalesOrder.findOne({
        where: { po_id: po.id },
        transaction: t,
      });

      if (!existingSO) {
        await createSalesOrderFromPO(po, t);
      }
    }

    await t.commit();

    const result = await getPOWithItems(po.id);
    return commonService.createdResponse(res, result);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};


// Helper: fetch PO with items via raw joins to master names
const getPOWithItems = async (poId) => {
  const po = await models.PurchaseOrder.findByPk(poId, { raw: true });
  if (!po) return null;

  const items = await sequelize.query(
    `SELECT 
       poi.*, 
       mt.material_type   AS material_type_name,
       c.category_name    AS category_name,
       sc.subcategory_name AS subcategory_name
     FROM purchase_order_items poi
     LEFT JOIN "materialTypes" mt ON poi.material_type_id = mt.id
     LEFT JOIN categories c       ON poi.category_id = c.id
     LEFT JOIN subcategories sc   ON poi.subcategory_id = sc.id
     WHERE poi.po_id = :id AND poi.deleted_at IS NULL
     ORDER BY poi.id ASC`,
    { replacements: { id: poId }, type: sequelize.QueryTypes.SELECT }
  );

  return { ...po, items };
};

// Get PO by ID
const getPurchaseOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getPOWithItems(id);
    if (!data) return commonService.notFound(res, "Purchase Order not found");
    return commonService.okResponse(res, data);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update PO (header + update items by id only)
const updatePurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { items = [], ...updateData } = req.body || {};

    const po = await models.PurchaseOrder.findByPk(id, { transaction: t });
    if (!po) {
      await t.rollback();
      return commonService.notFound(res, "Purchase Order not found");
    }

    await po.update(updateData, { transaction: t });

    for (const item of items) {
      if (item && item.id) {
        const existing = await models.PurchaseOrderItem.findOne({
          where: { id: item.id, po_id: id },
          transaction: t,
        });
        if (existing) {
          const { id: _i, po_id: _p, created_at, updated_at, deleted_at, ...updatable } = item;
          await existing.update(updatable, { transaction: t });
        }
      }
    }

    await t.commit();
    const result = await getPOWithItems(id);
    return commonService.okResponse(res, result);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Delete PO (soft) and its items
const deletePurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const po = await models.PurchaseOrder.findByPk(id, { transaction: t });
    if (!po) {
      await t.rollback();
      return commonService.notFound(res, "Purchase Order not found");
    }
    await Promise.all([
      po.destroy({ transaction: t }),
      models.PurchaseOrderItem.destroy({ where: { po_id: id }, transaction: t }),
    ]);
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// List POs with pagination and filters (raw SQL)
const listPurchaseOrdersForBranchAdmin = async (req, res) => {
  try {
    const {
      page,
      limit,
      status_id = 1, // default 1- pending, 2- Approved and 3- Rejected
      date,
      search,
      branch_id,
      vendor_id,
    } = req.query;

    const replacements = {};

    // ---------------- BASE FILTER ----------------
    let whereSql = `
      WHERE p.deleted_at IS NULL
    `;

    if (status_id) {
      whereSql += ` AND p.status_id = :status_id`;
      replacements.status_id = Number(status_id);
    }

    if (date) {
      whereSql += ` AND p.po_date = :date`;
      replacements.date = date;
    }

    if (branch_id) {
      whereSql += ` AND p.branch_id = :branch_id`;
      replacements.branch_id = Number(branch_id);
    }

    if (vendor_id) {
      whereSql += ` AND p.vendor_id = :vendor_id`;
      replacements.vendor_id = Number(vendor_id);
    }

    if (search) {
      whereSql += `
        AND (
          p.po_no ILIKE :search
          OR v.vendor_name ILIKE :search
          OR b.branch_name ILIKE :search
          OR sa.proprietor ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }

    const commonJoins = `
      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN branches b ON b.id = p.branch_id

      -- created by branch
      LEFT JOIN branches cb
        ON p.entity_type = 'branch'
        AND cb.id = p.order_by_user_id

      -- created by superadmin
      LEFT JOIN superadmin_profiles sa
        ON p.entity_type = 'superadmin'
        AND sa.id = p.order_by_user_id
    `;

    const countCardsSql = `
      SELECT
        COUNT(CASE WHEN p.status_id = 1 THEN 1 END) AS approval_pending,
        COUNT(CASE WHEN p.status_id = 2 THEN 1 END) AS approved,
        COUNT(CASE WHEN p.status_id = 3 THEN 1 END) AS rejected
      FROM purchase_orders p
      ${commonJoins}
      ${whereSql.replace("AND p.status_id = :status_id", "")}
    `;

    const [statusCounts] = await sequelize.query(countCardsSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    let paginationSql = "";
    let pageNum = null;
    let limitNum = null;

    if (page || limit) {
      pageNum = Number(page) || 1;
      limitNum = Number(limit) || 10;
      const offset = (pageNum - 1) * limitNum;

      paginationSql = ` LIMIT :limit OFFSET :offset`;
      replacements.limit = limitNum;
      replacements.offset = offset;
    }

    // TOTAL COUNT
    const totalSql = `
      SELECT COUNT(DISTINCT p.id) AS total
      FROM purchase_orders p
      ${commonJoins}
      ${whereSql}
    `;

    const [countResult] = await sequelize.query(totalSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const total = Number(countResult.total || 0);

    const listSql = `
      SELECT
        p.id,
        p.po_no,
        p.po_date AS date,
        p.status_id,
        p.branch_id,
        p.entity_type,
        p.order_by_user_id,

        b.branch_name,

        v.id AS vendor_id,
        v.vendor_name,
        v.vendor_image_url,

        -- created by dynamic
        CASE
          WHEN p.entity_type = 'superadmin'
            THEN sa.proprietor
          WHEN p.entity_type = 'branch'
            THEN cb.branch_name
          ELSE NULL
        END AS created_by_name,

        CASE
          WHEN p.entity_type = 'superadmin'
            THEN sa.email_id
          WHEN p.entity_type = 'branch'
            THEN cb.email
          ELSE NULL
        END AS created_by_mail,

        COALESCE(SUM(poi.gross_wt_in_g), 0) AS ordered_weight

      FROM purchase_orders p

      ${commonJoins}

      LEFT JOIN purchase_order_items poi
        ON poi.po_id = p.id AND poi.deleted_at IS NULL

      ${whereSql}

      GROUP BY p.id, b.branch_name, v.id, v.vendor_name, v.vendor_image_url, sa.proprietor, sa.email_id, cb.branch_name, cb.email

      ORDER BY p.po_date DESC, p.id DESC

      ${paginationSql}
    `;

    const rows = await sequelize.query(listSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, {
      status_counts: {
        approval_pending: Number(statusCounts.approval_pending || 0),
        approved: Number(statusCounts.approved || 0),
        rejected: Number(statusCounts.rejected || 0),
      },
      total,
      ...(page || limit
        ? {
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
          limit: limitNum,
        }
        : {}),
      data: rows,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listPurchaseOrdersForSuperAdmin = async (req, res) => {
  try {
    const {
      page,
      limit,
      status_id = 1,
      date,
      search,
      branch_id,
      vendor_id,
    } = req.query;

    const replacements = {};

    let whereSql = `
      WHERE p.deleted_at IS NULL
    `;

    if (date) {
      whereSql += ` AND p.po_date = :date`;
      replacements.date = date;
    }

    if (branch_id) {
      whereSql += ` AND p.branch_id = :branch_id`;
      replacements.branch_id = Number(branch_id);
    }

    if (vendor_id) {
      whereSql += ` AND p.vendor_id = :vendor_id`;
      replacements.vendor_id = Number(vendor_id);
    }

    if (search) {
      whereSql += `
        AND (
          p.po_no ILIKE :search
          OR v.vendor_name ILIKE :search
          OR b.branch_name ILIKE :search
          OR cb.branch_name ILIKE :search
          OR sa.proprietor ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }

    const commonJoins = `
      LEFT JOIN vendors v 
        ON v.id = p.vendor_id

      LEFT JOIN branches b 
        ON b.id = p.branch_id

      LEFT JOIN sales_orders so
        ON so.po_id = p.id
       AND so.deleted_at IS NULL

      -- if branch created
      LEFT JOIN branches cb
        ON p.entity_type = 'branch'
       AND cb.id = p.order_by_user_id

      -- if superadmin created
      LEFT JOIN superadmin_profiles sa
        ON p.entity_type = 'superadmin'
       AND sa.id = p.order_by_user_id
    `;

    // ==========================================================
    // SCORE CARD COUNTS
    //
    // 1 = Pending Admin Approval 
    // 2 = Approved + Vendor Accepted / Pending Vendor Response
    // 3 = Rejected by Superadmin
    // 4 = Approved by Admin but Vendor Rejected
    // ==========================================================
    const countCardsSql = `
      SELECT
        COUNT(
          CASE
            WHEN p.status_id = 1
            THEN 1
          END
        ) AS approval_pending,

        COUNT(
          CASE
            WHEN p.status_id = 2
            AND (
                  so.status IS NULL
                  OR so.status = 'pending'
                  OR so.status = 'accepted'
            )
            THEN 1
          END
        ) AS approved,

        COUNT(
          CASE
            WHEN p.status_id = 3
            THEN 1
          END
        ) AS rejected_by_superadmin,

        COUNT(
          CASE
            WHEN p.status_id = 2
            AND so.status = 'rejected'
            THEN 1
          END
        ) AS rejected_by_vendor

      FROM purchase_orders p
      ${commonJoins}
      ${whereSql}
    `;

    const [statusCounts] = await sequelize.query(countCardsSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    let statusWhere = "";

    //status_id: 1 = Approval Pending, 2 = Approved, 3 = Rejected by Superadmin, 4 = Rejected by Vendor
    if (Number(status_id) === 1) {
      statusWhere = `
        AND p.status_id = 1
      `;
    }

    if (Number(status_id) === 2) {
      statusWhere = `
      AND p.status_id = 2
      AND (
        so.status IS NULL
        OR so.status = 'pending'
        OR so.status = 'accepted'
      )`;
    }

    if (Number(status_id) === 3) {
      statusWhere = `
        AND p.status_id = 3
      `;
    }

    if (Number(status_id) === 4) {
      statusWhere = `
        AND p.status_id = 2
        AND so.status = 'rejected'
      `;
    }

    const finalWhereSql = whereSql + statusWhere;

    let paginationSql = "";
    let pageNum = null;
    let limitNum = null;

    if (page || limit) {
      pageNum = Number(page) || 1;
      limitNum = Number(limit) || 10;

      const offset = (pageNum - 1) * limitNum;

      paginationSql = `
        LIMIT :limit OFFSET :offset
      `;

      replacements.limit = limitNum;
      replacements.offset = offset;
    }

    const totalSql = `
      SELECT COUNT(DISTINCT p.id) AS total
      FROM purchase_orders p
      ${commonJoins}
      ${finalWhereSql}
    `;

    const [countResult] = await sequelize.query(totalSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const total = Number(countResult.total || 0);

    // MAIN LIST
    const listSql = `
      SELECT
        p.id,
        p.po_no,
        p.po_date AS date,
        p.status_id,
        p.branch_id,
        p.entity_type,
        p.order_by_user_id,

        so.status AS vendor_status,

        b.branch_name,

        v.id AS vendor_id,
        v.vendor_name,
        v.vendor_image_url,

        CASE
          WHEN p.entity_type = 'superadmin'
            THEN sa.proprietor
          WHEN p.entity_type = 'branch'
            THEN cb.branch_name
          ELSE NULL
        END AS created_by_name,

        CASE
          WHEN p.entity_type = 'superadmin'
            THEN sa.email_id
          WHEN p.entity_type = 'branch'
            THEN cb.email
          ELSE NULL
        END AS created_by_mail,

        CASE
          WHEN p.status_id = 3
            THEN 'Rejected by Superadmin'

          WHEN p.status_id = 2
           AND so.status = 'rejected'
            THEN 'Rejected by Vendor'

          WHEN p.status_id = 2
           AND so.status = 'accepted'
            THEN 'Approved'

          WHEN p.status_id = 2
            AND (so.status = 'pending' OR so.status IS NULL)
              THEN 'Approved'

          WHEN p.status_id = 1
            THEN 'Approval Pending'

          ELSE '-'
        END AS approval_label,

        COALESCE(SUM(poi.gross_wt_in_g), 0) AS ordered_weight

      FROM purchase_orders p

      ${commonJoins}

      LEFT JOIN purchase_order_items poi
        ON poi.po_id = p.id
       AND poi.deleted_at IS NULL

      ${finalWhereSql}

      GROUP BY
        p.id,
        so.status,
        b.branch_name,
        v.id,
        v.vendor_name,
        v.vendor_image_url,
        sa.proprietor,
        sa.email_id,
        cb.branch_name,
        cb.email

      ORDER BY p.po_no DESC, p.id DESC

      ${paginationSql}
    `;

    const rows = await sequelize.query(listSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // RESPONSE
    return commonService.okResponse(res, {
      status_counts: {
        approval_pending: Number(
          statusCounts.approval_pending || 0
        ),
        approved: Number(
          statusCounts.approved || 0
        ),
        rejected_by_vendor: Number(
          statusCounts.rejected_by_vendor || 0
        ),
        rejected_by_superadmin: Number(
          statusCounts.rejected_by_superadmin || 0
        ),
      },

      total,

      ...(page || limit
        ? {
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
          limit: limitNum,
        }
        : {}),

      data: rows,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Detailed view (header + vendor address names + branch address name + items)
const getPurchaseOrderView = async (req, res) => {
  try {
    const { id } = req.params;

    const [headerRows] = await sequelize.query(
      `
      SELECT 
        p.id,
        p.po_no,
        p.po_date,
        p.subtotal_amount,
        p.sgst_percent,
        p.sgst_amount,
        p.cgst_percent,
        p.cgst_amount,         
        p.round_off,
        p.total_amount,
        p.amount_in_words,
        p.remarks,

        -- 🏢 BRANCH DETAILS
        b.id            AS branch_id,
        b.branch_name   AS branch_name,
        b.address       AS branch_address,
        b.mobile        AS branch_mobile,
        b.gst_no        AS branch_gst_no,
        bd.district_name AS branch_district,
        bs.state_name    AS branch_state,
        bc.country_name  AS branch_country,

        -- 🧾 VENDOR DETAILS
        v.id            AS vendor_id,
        v.vendor_name,
        v.address       AS vendor_address,
        v.mobile        AS vendor_mobile,
        v.gst_no        AS vendor_gst_no,
        vd.district_name AS vendor_district,
        vs.state_name    AS vendor_state,
        vc.country_name  AS vendor_country

      FROM purchase_orders p

      LEFT JOIN branches b       ON b.id = p.branch_id
      LEFT JOIN districts bd     ON bd.id = b.district_id
      LEFT JOIN states bs        ON bs.id = b.state_id
      LEFT JOIN countries bc     ON bc.id = bs.country_id

      LEFT JOIN vendors v        ON v.id = p.vendor_id
      LEFT JOIN districts vd    ON vd.id = v.district_id
      LEFT JOIN states vs       ON vs.id = v.state_id
      LEFT JOIN countries vc    ON vc.id = vs.country_id

      WHERE p.id = :id
      LIMIT 1;
      `,
      { replacements: { id }, type: sequelize.QueryTypes.SELECT }
    );

    if (!headerRows || headerRows.length === 0) {
      return commonService.notFound(res, "Purchase Order not found");
    }

    // ---------------- ITEMS ----------------
    const items = await sequelize.query(
      `
      SELECT 
        poi.*,
        mt.material_type   AS material_type_name,
        c.category_name    AS category_name,
        sc.subcategory_name AS subcategory_name
      FROM purchase_order_items poi
      LEFT JOIN "materialTypes" mt ON poi.material_type_id = mt.id
      LEFT JOIN categories c       ON poi.category_id = c.id
      LEFT JOIN subcategories sc   ON poi.subcategory_id = sc.id
      WHERE poi.po_id = :id
        AND poi.deleted_at IS NULL
      ORDER BY poi.id ASC;
      `,
      { replacements: { id }, type: sequelize.QueryTypes.SELECT }
    );

    // ---------------- TOTALS ----------------
    const [totals] = await sequelize.query(
      `
      SELECT 
        COALESCE(SUM(poi.gross_wt_in_g), 0) AS total_ordered_weight,
        COALESCE(SUM(poi.amount), 0)         AS total_amount
      FROM purchase_order_items poi
      WHERE poi.po_id = :id
        AND poi.deleted_at IS NULL;
      `,
      { replacements: { id }, type: sequelize.QueryTypes.SELECT }
    );

    return commonService.okResponse(res, {
      header: headerRows,
      items,
      totals,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Minimal dropdown list
const listPurchaseOrderNumbers = async (req, res) => {
  try {
    const rows = await models.PurchaseOrder.findAll({
      attributes: ["id", "po_no", "po_date"],
      order: [["created_at", "DESC"]],
    });
    return commonService.okResponse(res, { purchase_orders: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Generate PO code
const generatePoCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.PurchaseOrder,
      "po_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { po_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update PO status (approve/reject)
const updatePurchaseOrderStatus = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status_id, remarks } = req.body;

    if (![2, 3].includes(Number(status_id))) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "Invalid status. Only Approved or Rejected allowed"
      );
    }

    const po = await models.PurchaseOrder.findByPk(id, { transaction: t });
    if (!po) {
      await t.rollback();
      return commonService.notFound(res, "Purchase order not found");
    }

    // ❗ Only pending PO can be acted on
    if (po.status_id !== 1) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "Only approval pending PO can be updated"
      );
    }

    await po.update(
      {
        status_id,
        remarks,
      },
      { transaction: t }
    );

    // vendor should get notification only after PO is approved.
    if (Number(status_id) === 2) {
      // Safety check
      const existingSO = await models.SalesOrder.findOne({
        where: { po_id: po.id },
        transaction: t,
      });

      if (!existingSO) {
        await createSalesOrderFromPO(po, t);
      }
    }

    await t.commit();
    return commonService.okResponse(res, po);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const createSalesOrderFromPO = async (po, t) => {
  return models.SalesOrder.create(
    {
      po_id: po.id,
      vendor_id: po.vendor_id,

      status: "pending",

      // copy finalised amounts from PO
      sub_total: po.subtotal_amount,
      sgst_percentage: po.sgst_percent,
      sgst_amount: po.sgst_amount,
      cgst_percentage: po.cgst_percent,
      cgst_amount: po.cgst_amount,
      round_off: po.round_off,
      total_amount: po.total_amount,

      created_by: po.entity_type,
    },
    { transaction: t }
  );
};


module.exports = {
  createPurchaseOrder,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  listPurchaseOrdersForBranchAdmin,
  listPurchaseOrdersForSuperAdmin,
  getPurchaseOrderView,
  listPurchaseOrderNumbers,
  generatePoCode,
  updatePurchaseOrderStatus
};


