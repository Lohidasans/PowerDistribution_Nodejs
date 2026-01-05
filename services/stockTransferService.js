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
    const { items = [], ...transferData } = req.body;

    // Required validation
    const requiredFields = ["transfer_no", "date", "branch_from", "branch_to", "reference_no", "created_by"];
    for (const field of requiredFields) {
      if (!transferData[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    if (transferData.transfer_no)
    {
      const existing = await models.StockTransfer.findOne({
        where: {
          transfer_no: transferData.transfer_no,
          deleted_at: null,     // only check active (non-deleted) records
        }
      });
      if (existing) {
        return commonService.badRequest(res, { message: "Stock Transfer code already exists" });
      }
    }
    
    // Create Stock Transfer
    const stockTransfer = await models.StockTransfer.create(transferData, { transaction });

    // Insert items
    const processedItems = items.map((item) => ({
      ...item,
      stock_transfer_id: stockTransfer.id,
    }));

    if (processedItems.length > 0) {
      await models.StockTransferItem.bulkCreate(processedItems, { transaction });
    }

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
      
      -- Material, Category, Subcategory names
      mt.material_type AS material_type_name,
      c.category_name AS category_name,
      sc.subcategory_name AS subcategory_name,
      
      -- From Branch Details
      bf.id AS branch_from_id,
      bf.address AS branch_from_address,
      bf.pin_code AS branch_from_pin_code,
      bf.branch_name AS branch_from_name,
      df.district_name AS branch_from_district,
      sf.state_name AS branch_from_state,
      
      -- To Branch Details
      bt.id AS branch_to_id,
      bt.address AS branch_to_address,
      bt.pin_code AS branch_to_pin_code,
      bt.branch_name AS branch_to_name,
      dt.district_name AS branch_to_district,
      st.state_name AS branch_to_state

    FROM "stock_transfer_items" sti
    
    -- Joins for names
    LEFT JOIN "materialTypes" mt ON sti.material_type_id = mt.id
    LEFT JOIN categories c ON sti.category_id = c.id
    LEFT JOIN subcategories sc ON sti.subcategory_id = sc.id
    
    -- Join stock_transfer to get branch_from and branch_to
    INNER JOIN stock_transfers stf ON sti.stock_transfer_id = stf.id
    
    -- From Branch + Location
    LEFT JOIN branches bf ON stf.branch_from = bf.id
    LEFT JOIN districts df ON bf.district_id = df.id
    LEFT JOIN states sf ON bf.state_id = sf.id
    
    -- To Branch + Location
    LEFT JOIN branches bt ON stf.branch_to = bt.id
    LEFT JOIN districts dt ON bt.district_id = dt.id
    LEFT JOIN states st ON bt.state_id = st.id

    WHERE sti.stock_transfer_id = :stockTransferId
    
    ORDER BY sti.id ASC`,
      {
        replacements: { stockTransferId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return {
      ...stockTransfer,
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
