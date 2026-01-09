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

// Create Stock Transfer with items
const createStockTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { items = [], remarks, created_by, ...transferData } = req.body;

    /* -------------------- VALIDATION -------------------- */
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
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    /* --------- UNIQUE TRANSFER NO CHECK --------- */
    const existing = await models.StockTransfer.findOne({
      where: {
        transfer_no: req.body.transfer_no,
        deleted_at: null,
      },
    });

    if (existing) {
      await transaction.rollback();
      return commonService.badRequest(res, {
        message: "Stock Transfer code already exists",
      });
    }

    // Branch Validation
    if (branch_from === branch_to) {
      await transaction.rollback();
      return commonService.badRequest(res, "Source and destination branch cannot be same");
    }

    const branchIds = [branch_from, branch_to];
    const branches = await models.Branch.findAll({
      where: {
        id: { [Op.in]: branchIds },
      },
      raw: true,
      transaction,
    });

    const foundBranchIds = branches.map(b => b.id);

    if (!foundBranchIds.includes(branch_from)) {
      await transaction.rollback();
      return commonService.badRequest(res, "Invalid branch_from Id");
    }

    if (!foundBranchIds.includes(branch_to)) {
      await transaction.rollback();
      return commonService.badRequest(res, "Invalid branch_to Id");
    }


    /* ---------------- CREATE STOCK TRANSFER ---------------- */
    const stockTransfer = await models.StockTransfer.create(
      {
        ...transferData,
        created_by,
        remarks,
        status_id: 1, // New
      },
      { transaction }
    );

    /* ---------------- INSERT ITEMS ---------------- */
    if (items.length > 0) {
      const stockItems = items.map((item) => ({
        ...item,
        stock_transfer_id: stockTransfer.id,
      }));

      await models.StockTransferItem.bulkCreate(stockItems, {
        transaction,
      });
    }

    /* ---------------- INSERT STATUS HISTORY ---------------- */
    await models.StockTransferStatusHistories.create(
      {
        stock_transfer_id: stockTransfer.id,
        status_id: 1, // New
        updated_by: created_by,
        remarks: remarks || "Stock Transfer Created",
      },
      { transaction }
    );

    /* ---------------- COMMIT ---------------- */
    await transaction.commit();

    const result = await getStockTransferWithItems(stockTransfer.id);
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error("Stock Transfer Create Error =>", error);
    return commonService.handleError(res, error);
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
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const whereCondition = {
      [Op.or]: [
        { transfer_no: { [Op.iLike]: `%${search}%` } },
        { reference_no: { [Op.iLike]: `%${search}%` } },
      ],
    };

    const { count, rows } = await models.StockTransfer.findAndCountAll({
      where: whereCondition,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Get branch and staff details for each transfer
    const transfers = await Promise.all(
      rows.map(async (transfer) => {
        const [branchFrom, branchTo, staff] = await Promise.all([
          models.Branch.findByPk(transfer.branch_from, {
            attributes: ['branch_name'],
            raw: true,
          }),
          models.Branch.findByPk(transfer.branch_to, {
            attributes: ['branch_name'],
            raw: true,
          }),
          models.Employee.findByPk(transfer.staff_name_id, {
            attributes: ['employee_name'],
            raw: true,
          }),
        ]);

        return {
          ...transfer.get({ plain: true }),
          branch_from_name: branchFrom?.branch_name || null,
          branch_to_name: branchTo?.branch_name || null,
          staff_name: staff?.staff_name || null,
        };
      })
    );

    return commonService.okResponse(res, {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      data: transfers,
    });
  } catch (error) {
    console.error('Error listing stock transfers:', error);
    return commonService.handleError(res, error);
  }
};

module.exports = {
  generateStockCode,
  createStockTransfer,
  getStockTransferById,
  updateStockTransfer,
  deleteStockTransfer,
  listStockTransfers,
};
