const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");

// Create Ledger
const create = async (req, res) => {
  try {
    const { ledger_group_no, ledger_name, ledger_no } = req.body;

    // Check if ledger group exists
    const ledgerGroup = await models.LedgerGroup.findByPk(ledger_group_no);
    if (!ledgerGroup) {
      return commonService.badRequest(res, "Ledger group not found");
    }

    // Create new ledger
    const ledger = await models.Ledger.create({
      ledger_no,
      ledger_group_no,
      ledger_name,
    });

    // Get the created ledger with the ledger group details
    const createdLedger = await models.Ledger.findByPk(ledger.id, {
      include: [
        {
          model: models.LedgerGroup,
          as: "ledgerGroup",
          attributes: ["id", "ledger_group_no", "ledger_group_name"],
        },
      ],
    });

    return commonService.createdResponse(res, { ledger: createdLedger });
  } catch (err) {
    console.error("Error creating ledger:", err);
    return commonService.handleError(res, err);
  }
};

// Bulk Create Ledgers
const bulkCreate = async (req, res) => {
  try {
    const { ledgers } = req.body;

    if (!Array.isArray(ledgers) || ledgers.length === 0) {
      return commonService.badRequest(res, "Valid ledgers array is required");
    }

    // Validate that all ledger groups exist
    const ledgerGroupIds = [
      ...new Set(ledgers.map((ledger) => ledger.ledger_group_no)),
    ];
    const existingGroups = await models.LedgerGroup.findAll({
      where: { id: ledgerGroupIds },
    });

    if (existingGroups.length !== ledgerGroupIds.length) {
      return commonService.badRequest(
        res,
        "One or more ledger groups do not exist"
      );
    }

    const createdLedgers = await models.Ledger.bulkCreate(ledgers, {
      validate: true,
    });

    return commonService.createdResponse(res, { ledgers: createdLedgers });
  } catch (err) {
    console.error("Error bulk creating ledgers:", err);
    return commonService.handleError(res, err);
  }
};

// List all Ledgers with optional search and filters
const list = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, ledger_group_no } = req.query;
    const offset = (page - 1) * limit;

    let where = {};

    if (search) {
      where = {
        [Op.or]: [{ ledger_name: { [Op.like]: `%${search}%` } }],
      };
    }

    if (ledger_group_no) {
      where.ledger_group_no = ledger_group_no;
    }

    const { count, rows: ledgers } = await models.Ledger.findAndCountAll({
      where,
      include: [
        {
          model: models.LedgerGroup,
          as: "ledgerGroup",
          attributes: ["id", "ledger_group_no", "ledger_group_name"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, {
      ledgers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching ledgers:", err);
    return commonService.handleError(res, err);
  }
};

// Get Ledger by ID
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const ledger = await models.Ledger.findByPk(id, {
      include: [
        {
          model: models.LedgerGroup,
          as: "ledgerGroup",
          attributes: ["id", "ledger_group_no", "ledger_group_name"],
        },
      ],
    });

    if (!ledger) {
      return commonService.notFound(res, "Ledger not found");
    }

    return commonService.okResponse(res, { ledger });
  } catch (err) {
    console.error("Error fetching ledger by ID:", err);
    return commonService.handleError(res, err);
  }
};

// Get Ledgers by Ledger Group ID
const getByLedgerGroupId = async (req, res) => {
  try {
    const { ledgerGroupId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Check if ledger group exists
    const ledgerGroup = await models.LedgerGroup.findByPk(ledgerGroupId);
    if (!ledgerGroup) {
      return commonService.notFound(res, "Ledger group not found");
    }

    const { count, rows: ledgers } = await models.Ledger.findAndCountAll({
      where: { ledger_group_no: ledgerGroupId },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, {
      ledgers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching ledgers by ledger group ID:", err);
    return commonService.handleError(res, err);
  }
};

// Update Ledger
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { ledger_group_no, ledger_name, ledger_no } = req.body;

    const ledger = await models.Ledger.findByPk(id);

    if (!ledger) {
      return commonService.notFound(res, "Ledger not found");
    }

    // If ledger_group_no is provided, check if it exists
    if (ledger_group_no) {
      const ledgerGroup = await models.LedgerGroup.findByPk(ledger_group_no);
      if (!ledgerGroup) {
        return commonService.badRequest(res, "Ledger group not found");
      }
    }

    // Update the ledger
    await ledger.update({
      ledger_group_no: ledger_group_no || ledger.ledger_group_no,
      ledger_name: ledger_name || ledger.ledger_name,
      ledger_no: ledger_no || ledger.ledger_no,
    });

    // Get the updated ledger with ledger group details
    const updatedLedger = await models.Ledger.findByPk(id, {
      include: [
        {
          model: models.LedgerGroup,
          as: "ledgerGroup",
          attributes: ["id", "ledger_group_no", "ledger_group_name"],
        },
      ],
    });

    return commonService.okResponse(res, { ledger: updatedLedger });
  } catch (err) {
    console.error("Error updating ledger:", err);
    return commonService.handleError(res, err);
  }
};

// Delete Ledger (soft delete)
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const ledger = await models.Ledger.findByPk(id);

    if (!ledger) {
      return commonService.notFound(res, "Ledger not found");
    }

    await ledger.destroy(); // This uses paranoid deletion (soft delete)

    return commonService.okResponse(res, {
      message: "Ledger deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting ledger:", err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  create,
  bulkCreate,
  list,
  getById,
  getByLedgerGroupId,
  update,
  remove,
};
