const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");

// Create UOM
const create = async (req, res) => {
  try {
    const { uom_code, uom_name, short_code, status = "Active" } = req.body;

    // Check if UOM code already exists
    const uomCodeExists = await models.Uom.findOne({
      where: { uom_code },
    });

    if (uomCodeExists) {
      return commonService.badRequest(res, "UOM code already exists");
    }

    // Check if UOM name and short code combination already exists
    const uomExists = await models.Uom.findOne({
      where: {
        uom_name,
        short_code,
      },
    });

    if (uomExists) {
      return commonService.badRequest(
        res,
        "UOM with this name and short code already exists"
      );
    }

    // Create new UOM
    const uom = await models.Uom.create({
      uom_code,
      uom_name,
      short_code,
      status,
    });

    return commonService.createdResponse(res, { uom });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List UOMs with optional search
const list = async (req, res) => {
  try {
    const searchKey = req.query.search || "";
    const status = req.query.status;

    let whereClause = {};

    if (searchKey) {
      whereClause[Op.or] = [
        { uom_code: { [Op.iLike]: `%${searchKey}%` } },
        { uom_name: { [Op.iLike]: `%${searchKey}%` } },
        { short_code: { [Op.iLike]: `%${searchKey}%` } },
      ];
    }

    if (status) {
      whereClause.status = status;
    }

    const uoms = await models.Uom.findAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { uoms });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get UOM by ID
const getById = async (req, res) => {
  try {
    const uom = await models.Uom.findByPk(req.params.id);

    if (!uom) {
      return commonService.notFound(res, message.failure.notFound);
    }

    return commonService.okResponse(res, { uom });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get UOM by Code
const getByCode = async (req, res) => {
  try {
    const uom = await models.Uom.findOne({
      where: { uom_code: req.params.code },
    });

    if (!uom) {
      return commonService.notFound(res, "UOM not found with this code");
    }

    return commonService.okResponse(res, { uom });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update UOM
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { uom_code, uom_name, short_code, status } = req.body;

    const uom = await commonService.findById(models.Uom, id, res);
    if (!uom) return;

    // Check if the new UOM code already exists (excluding current record)
    if (uom_code && uom_code !== uom.uom_code) {
      const uomCodeExists = await models.Uom.findOne({
        where: {
          uom_code,
          id: { [Op.ne]: id },
        },
      });

      if (uomCodeExists) {
        return commonService.badRequest(res, "UOM code already exists");
      }
    }

    // Check if the new UOM name and short code combination already exists (excluding current record)
    if (
      (uom_name && uom_name !== uom.uom_name) ||
      (short_code && short_code !== uom.short_code)
    ) {
      const uomExists = await models.Uom.findOne({
        where: {
          uom_name: uom_name || uom.uom_name,
          short_code: short_code || uom.short_code,
          id: { [Op.ne]: id },
        },
      });

      if (uomExists) {
        return commonService.badRequest(
          res,
          "UOM with this name and short code already exists"
        );
      }
    }

    // Update UOM
    await uom.update({
      uom_code: uom_code || uom.uom_code,
      uom_name: uom_name || uom.uom_name,
      short_code: short_code || uom.short_code,
      status: status || uom.status,
    });

    return commonService.okResponse(res, { uom });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Soft Delete UOM
const remove = async (req, res) => {
  try {
    const uom = await commonService.findById(models.Uom, req.params.id, res);
    if (!uom) return;

    await uom.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Toggle Status (Active/Inactive)
const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const uom = await commonService.findById(models.Uom, id, res);
    if (!uom) return;

    // Validate status value
    if (!["Active", "Inactive"].includes(status)) {
      return commonService.badRequest(
        res,
        "Status must be either 'Active' or 'Inactive'"
      );
    }

    uom.status = status;
    await uom.save();

    return commonService.okResponse(res, { uom });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get all active UOMs (for dropdown/select purposes)
const getActiveUoms = async (req, res) => {
  try {
    const uoms = await models.Uom.findAll({
      where: { status: "Active" },
      attributes: ["id", "uom_code", "uom_name", "short_code"],
      order: [["uom_name", "ASC"]],
    });

    return commonService.okResponse(res, { uoms });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  create,
  list,
  getById,
  getByCode,
  update,
  remove,
  toggleStatus,
  getActiveUoms,
};
