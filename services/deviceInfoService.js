const { models, sequelize } = require("../models/index");
const message = require("../constants/en.json");
const { Op } = require("sequelize");
const { buildSearchCondition } = require("../helpers/queryHelper");

// Create a new Device Info
const createDeviceInfo = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { device_name, mac_address, devices, ip_address, branch_id } = req.body;

    // Validate required fields
    if (!device_name || !branch_id) {
      await t.rollback();
      return res.status(400).json({
        statusCode: 400,
        message: "Device name and branch ID are required",
      });
    }

    // Check if branch exists
    const branch = await models.Branch.findByPk(branch_id);
    if (!branch) {
      await t.rollback();
      return res.status(404).json({
        statusCode: 404,
        message: "Branch not found",
      });
    }

    // Create device info
    const deviceInfo = await models.DeviceInfo.create(
      {
        device_name,
        mac_address,
        devices,
        ip_address,
        branch_id,
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      statusCode: 201,
      message: "Device info created successfully",
      data: deviceInfo,
    });
  } catch (error) {
    await t.rollback();
    console.error("Error creating device info:", error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Internal server error",
    });
  }
};

// List all Device Infos with pagination and search
const listDeviceInfos = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      branch_id,
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where condition
    const whereCondition = {};

    if (search) {
      whereCondition[Op.or] = [
        buildSearchCondition("device_name", search),
        buildSearchCondition("mac_address", search),
        buildSearchCondition("ip_address", search),
      ];
    }

    if (branch_id) {
      whereCondition.branch_id = branch_id;
    }

    // Get device infos with branch details
    const { rows: deviceInfos, count } = await models.DeviceInfo.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: models.Branch,
          as: "branch",
          attributes: ["id", "branch_name", "branch_code"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({
      statusCode: 200,
      message: "Device infos retrieved successfully",
      data: deviceInfos,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error listing device infos:", error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Internal server error",
    });
  }
};

// Get Device Info by ID
const getDeviceInfoById = async (req, res) => {
  try {
    const { id } = req.params;

    const deviceInfo = await models.DeviceInfo.findByPk(id, {
      include: [
        {
          model: models.Branch,
          as: "branch",
          attributes: ["id", "branch_name", "branch_code"],
        },
      ],
    });

    if (!deviceInfo) {
      return res.status(404).json({
        statusCode: 404,
        message: "Device info not found",
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Device info retrieved successfully",
      data: deviceInfo,
    });
  } catch (error) {
    console.error("Error getting device info:", error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Internal server error",
    });
  }
};

// Update Device Info
const updateDeviceInfo = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { device_name, mac_address, devices, ip_address, branch_id } = req.body;

    const deviceInfo = await models.DeviceInfo.findByPk(id, { transaction: t });

    if (!deviceInfo) {
      await t.rollback();
      return res.status(404).json({
        statusCode: 404,
        message: "Device info not found",
      });
    }

    // If branch_id is being updated, check if it exists
    if (branch_id && branch_id !== deviceInfo.branch_id) {
      const branch = await models.Branch.findByPk(branch_id);
      if (!branch) {
        await t.rollback();
        return res.status(404).json({
          statusCode: 404,
          message: "Branch not found",
        });
      }
    }

    // Update device info
    await deviceInfo.update(
      {
        device_name: device_name || deviceInfo.device_name,
        mac_address: mac_address !== undefined ? mac_address : deviceInfo.mac_address,
        devices: devices !== undefined ? devices : deviceInfo.devices,
        ip_address: ip_address !== undefined ? ip_address : deviceInfo.ip_address,
        branch_id: branch_id || deviceInfo.branch_id,
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(200).json({
      statusCode: 200,
      message: "Device info updated successfully",
      data: deviceInfo,
    });
  } catch (error) {
    await t.rollback();
    console.error("Error updating device info:", error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Internal server error",
    });
  }
};

// Delete Device Info (soft delete)
const deleteDeviceInfo = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const deviceInfo = await models.DeviceInfo.findByPk(id, { transaction: t });

    if (!deviceInfo) {
      await t.rollback();
      return res.status(404).json({
        statusCode: 404,
        message: "Device info not found",
      });
    }

    await deviceInfo.destroy({ transaction: t });
    await t.commit();

    return res.status(200).json({
      statusCode: 200,
      message: "Device info deleted successfully",
    });
  } catch (error) {
    await t.rollback();
    console.error("Error deleting device info:", error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Internal server error",
    });
  }
};

// Dropdown list for device infos
const deviceInfoDropdownList = async (req, res) => {
  try {
    const { branch_id } = req.query;
    
    const whereCondition = {};
    
    if (branch_id) {
      whereCondition.branch_id = branch_id;
    }

    const deviceInfos = await models.DeviceInfo.findAll({
      where: whereCondition,
      attributes: ["id", "device_name", "ip_address", "branch_id"],
      order: [["device_name", "ASC"]],
    });

    return res.status(200).json({
      statusCode: 200,
      message: "Device infos dropdown retrieved successfully",
      data: deviceInfos,
    });
  } catch (error) {
    console.error("Error getting device infos dropdown:", error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
  createDeviceInfo,
  listDeviceInfos,
  getDeviceInfoById,
  updateDeviceInfo,
  deleteDeviceInfo,
  deviceInfoDropdownList,
};
