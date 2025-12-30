const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

const createMaintenance = async (req, res) => {
  try {
    const { 
      date, 
      maintenance_type_id, 
      technician_name, 
      machine_performance, 
      remarks,
    } = req.body;

    // Required field validation
    if (!date || !maintenance_type_id || !technician_name || !machine_performance) {
      return commonService.badRequest(res, enMessage.common.requiredFields);
    }

    // Check if maintenance type exists
    const maintenanceType = await models.MaintenanceType.findByPk(maintenance_type_id, {
      paranoid: false
    });

    if (!maintenanceType || maintenanceType.deleted_at) {
      return commonService.badRequest(res, enMessage.maintenance.invalidType);
    }

    const maintenanceData = {
      date,
      maintenance_type_id,
      technician_name,
      machine_performance,
      remarks,
    };

    const row = await models.Maintenance.create(maintenanceData);
    
    // Fetch the created record with maintenance type details
    const createdMaintenance = await models.Maintenance.findByPk(row.id, {
      include: [
        {
          model: models.MaintenanceType,
          as: 'maintenance_type',
          attributes: ['id', 'type_name']
        }
      ]
    });
    
    return commonService.createdResponse(res, { maintenance: createdMaintenance });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listMaintenances = async (req, res) => {
  try {
    const { 
      search = "", 
      start_date, 
      end_date,
      maintenance_type_id
    } = req.query;
    
    const where = {
      deleted_at: null
    };
    
    // Build search condition
    const searchCondition = buildSearchCondition(search, [
      "technician_name",
      "remarks"
    ]);
    
    if (searchCondition) Object.assign(where, searchCondition);

    // Filter by date range if provided
    if (start_date && end_date) {
      where.date = {
        [Op.between]: [start_date, end_date]
      };
    } else if (start_date) {
      where.date = {
        [Op.gte]: start_date
      };
    } else if (end_date) {
      where.date = {
        [Op.lte]: end_date
      };
    }

    // Filter by maintenance type if provided
    if (maintenance_type_id) {
      where.maintenance_type_id = maintenance_type_id;
    }

    const items = await models.Maintenance.findAll({
      where,
      include: [
        {
          model: models.MaintenanceType,
          as: 'maintenance_type',
          attributes: ['id', 'type_name']
        }
      ],
      order: [["date", "DESC"], ["created_at", "DESC"]],
    });
    
    return commonService.okResponse(res, { maintenances: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getMaintenanceById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await models.Maintenance.findOne({
      where: { id, deleted_at: null },
      include: [
        {
          model: models.MaintenanceType,
          as: 'maintenance_type',
          attributes: ['id', 'type_name']
        }
      ],
      paranoid: false
    });
    
    if (!entity) {
      return commonService.notFound(res, enMessage.maintenance.notFound);
    }
    
    return commonService.okResponse(res, { maintenance: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateMaintenance = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      date,
      maintenance_type_id,
      technician_name,
      machine_performance,
      remarks,
    } = req.body;

    // Find the maintenance record
    const entity = await models.Maintenance.findByPk(id, { paranoid: false });
    
    if (!entity || entity.deleted_at) {
      return commonService.notFound(res, enMessage.maintenance.notFound);
    }

    // If maintenance_type_id is being updated, verify it exists
    if (maintenance_type_id && maintenance_type_id !== entity.maintenance_type_id) {
      const maintenanceType = await models.MaintenanceType.findByPk(maintenance_type_id, {
        paranoid: false
      });

      if (!maintenanceType || maintenanceType.deleted_at) {
        return commonService.badRequest(res, enMessage.maintenance.invalidType);
      }
    }

    // Only update fields that are provided in the request
    const updateData = {};
    const fields = [
      'date',
      'maintenance_type_id',
      'technician_name',
      'machine_performance',
      'remarks',
    ];
    
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    await entity.update(updateData);
    
    // Fetch the updated record with maintenance type details
    const updatedMaintenance = await models.Maintenance.findByPk(id, {
      include: [
        {
          model: models.MaintenanceType,
          as: 'maintenance_type',
          attributes: ['id', 'type_name']
        }
      ]
    });
    
    return commonService.okResponse(res, { maintenance: updatedMaintenance });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteMaintenance = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await models.Maintenance.findByPk(id);
    
    if (!entity) {
      return commonService.notFound(res, enMessage.maintenance.notFound);
    }
    
    await entity.destroy();
    
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get machine performance options
const getMachinePerformanceOptions = async (req, res) => {
  try {
    // Get the enum values from the model definition
    const performanceOptions = models.Maintenance.rawAttributes.machine_performance.values;
    
    return commonService.okResponse(res, { performanceOptions });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createMaintenance,
  listMaintenances,
  getMaintenanceById,
  updateMaintenance,
  deleteMaintenance,
  getMachinePerformanceOptions
};
