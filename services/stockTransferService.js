const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { Op } = require("sequelize");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Generate auto code: TRA001
const generateStockCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.StockTransfer,
      "transfer_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { stock_transfer_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

//BASIC REQUEST VALIDATION
const validateRequiredFields = async (req, transaction) => {
  const requiredFields = [
    "transfer_no",
    "date",
    "branch_from",
    "branch_to",
    "reference_no",
    "created_by",
  ];

  for (const field of requiredFields) {
    if (!req.body[field]) {
      throw new Error(`${field} is required`);
    }
  }
};

//UNIQUE TRANSFER NO
const validateUniqueTransferNo = async (transfer_no, transaction) => {
  const existing = await models.StockTransfer.findOne({
    where: { transfer_no, deleted_at: null },
    transaction,
  });

  if (existing) {
    throw new Error("Stock Transfer code already exists");
  }
};

//BRANCH VALIDATION
const validateBranches = async (branch_from, branch_to, transaction) => {
  if (branch_from === branch_to) {
    throw new Error("Source and destination branch cannot be the same");
  }

  const branches = await models.Branch.findAll({
    where: {
      id: { [Op.in]: [branch_from, branch_to] },
      deleted_at: null,
    },
    attributes: ["id"],
    raw: true,
    transaction,
  });

  const ids = branches.map(b => b.id);

  if (!ids.includes(branch_from)) {
    throw new Error("Invalid branch_from Id");
  }

  if (!ids.includes(branch_to)) {
    throw new Error("Invalid branch_to Id");
  }
};

// PRODUCT & ITEM DETAIL VALIDATION
const validateProductsAndItemDetails = async (
  items,
  productIds,
  itemDetailIds,
  transaction
) => {
  // Products
  const products = await models.Product.findAll({
    where: { id: { [Op.in]: productIds }, deleted_at: null },
    attributes: ["id"],
    raw: true,
    transaction,
  });

  const validProductIds = products.map(p => p.id);
  const invalidProduct = items.find(i => !validProductIds.includes(i.product_id));

  if (invalidProduct) {
    await transaction.rollback();
    throw new Error(`Invalid product_id: ${invalidProduct.product_id}`);
  }

  // Item details
  const itemDetails = await models.ProductItemDetail.findAll({
    where: { id: { [Op.in]: itemDetailIds }, deleted_at: null },
    attributes: ["id", "product_id"],
    raw: true,
    transaction,
  });

  const itemDetailMap = Object.fromEntries(
    itemDetails.map(d => [d.id, d.product_id])
  );

  const invalidDetail = items.find(
    i => !itemDetailMap[i.product_item_detail_id ]
  );

  if (invalidDetail) {
    await transaction.rollback();
    throw new Error(
      `Invalid product_item_detail_id : ${invalidDetail.product_item_detail_id }`
    );
  }

  const mismatch = items.find(
    i => itemDetailMap[i.product_item_detail_id ] !== i.product_id
  );

  if (mismatch) {
    await transaction.rollback();
    throw new Error(
      `Product item detail ID ${mismatch.product_item_detail_id } does not belong to product_id ${mismatch.product_id}`
    );
  }
};

//ITEM STRUCTURE VALIDATION
const validateItemsPayload = async (items, transaction) => {
  if (!items.length) {
    throw new Error("At least one item is required");
  }

  const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  const itemDetailIds = [...new Set(items.map(i => i.product_item_detail_id).filter(Boolean))];

  if (!productIds.length || !itemDetailIds.length) {
    throw new Error("product_id and product_item_detail_id are required in items");
  }

  return { productIds, itemDetailIds };
};


// Create Stock Transfer with items
const createStockTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { items = [], remarks, created_by, ...transferData } = req.body;
    const { transfer_no, branch_from, branch_to } = transferData;

    // VALIDATIONS
    await validateRequiredFields(req, transaction);
    await validateUniqueTransferNo(transfer_no, transaction);
    await validateBranches(branch_from, branch_to, transaction);

    const { productIds, itemDetailIds } =
      await validateItemsPayload(items, transaction);

    await validateProductsAndItemDetails(
      items,
      productIds,
      itemDetailIds,
      transaction
    );

    // CREATE MASTER
    const stockTransfer = await models.StockTransfer.create(
      {
        ...transferData,
        created_by,
        remarks,
        status_id: 1,
      },
      { transaction }
    );

    // INSERT ITEMS
    const stockItems = items.map(item => ({
      ...item,
      stock_transfer_id: stockTransfer.id,
    }));

    await models.StockTransferItem.bulkCreate(stockItems, { transaction });

    // STATUS HISTORY
    await models.StockTransferStatusHistory.create(
      {
        stock_transfer_id: stockTransfer.id,
        status_id: 1,
        updated_by: created_by,
        remarks: remarks || "Stock Transfer Created",
      },
      { transaction }
    );

    await transaction.commit();

    const result = await getStockTransferWithItems(stockTransfer.id);
    return commonService.createdResponse(res, result);

  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error("Stock Transfer Create Error =>", error);
    return commonService.badRequest(res, error.message);
  }
};

// Get Stock Transfer by ID with items
const getStockTransferById = async (req, res) => {
  try {
    const { id } = req.params;
    const stockTransfer = await getStockTransferWithItems(id);

    if (!stockTransfer) {
      return commonService.notFound(res, "Stock Transfer not found");
    }

    return commonService.okResponse(res, stockTransfer);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

const getStockTransferWithItems = async (stockTransferId) => {
  try {
    // Get Stock Transfer details
    const stockTransfer = await models.StockTransfer.findByPk(stockTransferId, {
      raw: true,
      nest: true,
    });

    if (!stockTransfer) return null;

    // Get Stock Transfer items with related data using raw queries
     const items = await sequelize.query(
      `
      SELECT
        sti.*,
        mt.material_type as material_type_name,
        c.category_name as category_name,
        sc.subcategory_name as subcategory_name
      FROM "stock_transfer_items" sti
      LEFT JOIN "materialTypes" mt ON sti.material_type_id = mt.id
      LEFT JOIN categories c ON sti.category_id = c.id
      LEFT JOIN subcategories sc ON sti.subcategory_id = sc.id
      WHERE sti.stock_transfer_id = :stockTransferId
      ORDER BY sti.id ASC
    `,
      {
        replacements: { stockTransferId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // TRACKING TIMELINE
    const tracking = await models.StockTransferTracking.findAll({
      where: {
        stock_transfer_id: stockTransferId,
        deleted_at: null,
      },
      order: [["created_at", "ASC"]],
      raw: true,
    })

    // Get branch details
    const [branchFrom, branchTo] = await Promise.all([
      models.Branch.findByPk(stockTransfer.branch_from, {
        attributes: ["id", "branch_name"],
        raw: true,
      }),
      models.Branch.findByPk(stockTransfer.branch_to, {
        attributes: ["id", "branch_name"],
        raw: true,
      })
    ]);

    return {
      ...stockTransfer,
      branch_from_detail: branchFrom || { id: stockTransfer.branch_from, branch_name: "Branch Not Found" },
      branch_to_detail: branchTo || { id: stockTransfer.branch_to, branch_name: "Branch Not Found" },
      items,
      tracking_: tracking,
    };
  } catch (error) {
    console.error("Error in getStockTransferWithItems:", error);
    throw error;
  }
};

// Update Stock Transfer and its items
const updateStockTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { items = [], ...updateData } = req.body;

    // Find existing Stock Transfer
    const stockTransfer = await models.StockTransfer.findByPk(id, { transaction });
    if (!stockTransfer) {
      await transaction.rollback();
      return commonService.notFound(res, "Stock Transfer not found");
    }

    // Update Stock Transfer header fields
    await stockTransfer.update(updateData, { transaction });

    // HARD DELETE old items
    await models.StockTransferItem.destroy({
      where: { stock_transfer_id: id },
      force: true,
      transaction,
    });

    // Insert new items
    const newItems = items.map((item) => ({
      ...item,
      stock_transfer_id: id,
    }));

    if (newItems.length > 0) {
      await models.StockTransferItem.bulkCreate(newItems, { transaction });
    }

    await transaction.commit();
    const result = await getStockTransferWithItems(id);
    return commonService.okResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Delete Stock Transfer (soft delete)
const deleteStockTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const stockTransfer = await models.StockTransfer.findByPk(id, { transaction });

    if (!stockTransfer) {
      await transaction.rollback();
      return commonService.notFound(res, "Stock Transfer not found");
    }

    // Soft delete Stock Transfer and its items
    await Promise.all([
      stockTransfer.destroy({ transaction }),
      models.StockTransferItem.destroy({
        where: { stock_transfer_id: id },
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

// List all Stock Transfers with pagination and search
const listStockTransfers = async (req, res) => {
  try {
    const {
      page,
      limit,
      search = "",
      status_id,
      branch_from,
      branch_to,
      from_date,
      to_date,
    } = req.query;

    // GLOBAL COUNTS (UNFILTERED)
    const baseWhere = { deleted_at: null };

    const [newCount, inProgressCount, deliveredCount] = await Promise.all([
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 1 } }),
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 2 } }),
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 3 } }),
    ]);

    // FILTERED WHERE
    const where = { deleted_at: null };

    if (status_id) where.status_id = status_id;
    if (branch_from) where.branch_from = branch_from;
    if (branch_to) where.branch_to = branch_to;

    // Date logic
    if (from_date && to_date) {
      where.date = { [Op.between]: [from_date, to_date] };
    } else if (from_date) {
      where.date = from_date;
    } else if (to_date) {
      where.date = to_date;
    }

    // Search
    if (search) {
      where[Op.or] = [
        { transfer_no: { [Op.iLike]: `%${search}%` } },
        { reference_no: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // QUERY OPTIONS
    const queryOptions = {
      where,
      order: [["created_at", "DESC"]],
    };

    const isPaginated = page || limit;

    if (isPaginated) {
      queryOptions.limit = parseInt(limit || 10);
      queryOptions.offset = (parseInt(page || 1) - 1) * queryOptions.limit;
    }

    // FETCH DATA
    const { rows, count } = isPaginated
      ? await models.StockTransfer.findAndCountAll(queryOptions)
      : { rows: await models.StockTransfer.findAll(queryOptions), count: null };

    // BRANCH NAMES
    const transfers = await Promise.all(
      rows.map(async (t) => {
        const [fromBranch, toBranch] = await Promise.all([
          models.Branch.findByPk(t.branch_from, {
            attributes: ["branch_name"],
            raw: true,
          }),
          models.Branch.findByPk(t.branch_to, {
            attributes: ["branch_name"],
            raw: true,
          }),
        ]);

        return {
          ...t.get({ plain: true }),
          branch_from_name: fromBranch?.branch_name || null,
          branch_to_name: toBranch?.branch_name || null,
        };
      })
    );

    return commonService.okResponse(res, {
      summary: {
        new: newCount,
        in_progress: inProgressCount,
        delivered: deliveredCount,
      },
      total: isPaginated ? count : transfers.length,
      page: isPaginated ? parseInt(page || 1) : null,
      limit: isPaginated ? parseInt(limit || 10) : null,
      data: transfers,
    });

  } catch (error) {
    console.error("Stock transfer list error:", error);
    return commonService.handleError(res, error);
  }
};


const updateStockTransferStatus = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      status_id,
      // Dispatch
      total_packages,
      total_weight,
      dispatch_date,
      transporter_name,
      vehicle_no,
      tracking_number,
      attach_bill_url,
      tracking_remarks,

      // Delivery
      delivered_date,
      received_by,
      received_weight,
      received_packages,
      delivery_remarks,
    } = req.body;

    if (!status_id ) {
      throw new Error("status_id is required");
    }

    // FETCH STOCK TRANSFER
    const stockTransfer = await models.StockTransfer.findOne({
      where: {
        id: id,
        deleted_at: null,
      },
      transaction,
    });

    if (!stockTransfer) {
      throw new Error("Stock Transfer not found");
    }

    // STATUS VALIDATION
    if (stockTransfer.status_id === 3) {
      throw new Error("Delivered stock transfer cannot be updated");
    }

    if (status_id !== stockTransfer.status_id + 1) {
      throw new Error("Invalid status transition");
    }

    // STATUS-SPECIFIC VALIDATION
    if (status_id === 2 && !dispatch_date) {
      throw new Error("Dispatch date is required");
    }

    if (status_id === 3 && !delivered_date) {
      throw new Error("Delivered date is required");
    }

    // UPDATE STOCK TRANSFER
    await stockTransfer.update(
      {
        status_id,
      },
      { transaction }
    );

    // INSERT TRACKING RECORD
    await models.StockTransferTracking.create(
      {
        stock_transfer_id: id,

        // Dispatch
        total_packages,
        total_weight,
        dispatch_date,
        transporter_name,
        vehicle_no,
        tracking_number,
        attach_bill_url,
        tracking_remarks,

        // Delivery
        delivered_date,
        received_by,
        received_weight,
        received_packages,
        delivery_remarks,
      },
      { transaction }
    );

    await transaction.commit();

    return commonService.okResponse(res, {
      message: "Stock transfer status updated successfully",
    });

  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error("Update Stock Transfer Status Error =>", error);
    return commonService.badRequest(res, error.message);
  }
};


module.exports = {
  generateStockCode,
  createStockTransfer,
  getStockTransferById,
  updateStockTransfer,
  deleteStockTransfer,
  listStockTransfers,
  validateRequiredFields,
  validateUniqueTransferNo,
  validateBranches,
  validateItemsPayload,
  validateProductsAndItemDetails,
  updateStockTransferStatus,
};
