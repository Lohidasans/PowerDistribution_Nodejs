const { sequelize, models } = require("../models");
const commonService = require("./commonService");
const { Op } = require('sequelize');

// Create a new leave request
const createLeave = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { leave_date, leave_type_id, reason,employee_id,branch_id } = req.body;
    
    const leave = await models.Leave.create(
      { 
        leave_date, 
        leave_type_id, 
        reason,
        employee_id,
        branch_id
      },
      { transaction }
    );

    await transaction.commit();
    return commonService.createdResponse(res, leave);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

const getAllLeaves = async (req, res) => {
  try {
    const { start_date, end_date, search, leave_type_id, branch_id, department_id } = req.query;

    // Base query with all necessary joins
    let query = `
      SELECT 
        l.id,
        l.leave_date,
        l.leave_type_id,
        l.employee_id,
        l.branch_id,
        l.reason,
        l.status_id,
        l.approved_by_id,
        l.entity_type_name,
        l.created_at,
        l.updated_at,
        lt.leave_type_name,
        e.employee_no,
        e.employee_name,
        e.profile_image_url,
        e.department_id,
        e.role_id,
        e.joining_date,
        e.employment_type,
        e.gender,
        e.date_of_birth,
        e.status,
        r.role_name,
        d.department_name,
        b.branch_name,
        b.address as branch_address,
        b.mobile as branch_mobile,
        b.email as branch_email,
        b.status as branch_status,
        CASE 
          WHEN l.entity_type_name = 'superadmin' THEN sa.proprietor
          WHEN l.entity_type_name = 'vendors' THEN v.vendor_name
          WHEN l.entity_type_name = 'employees' THEN ae.employee_name
          WHEN l.entity_type_name = 'branches' THEN ab.branch_name
          ELSE NULL
        END as approved_by_name,
        CASE 
          WHEN l.entity_type_name = 'superadmin' THEN sa.email_id
          WHEN l.entity_type_name = 'vendors' THEN v.email
          WHEN l.entity_type_name = 'employees' THEN aec.email_id
          WHEN l.entity_type_name = 'branches' THEN ab.email
          ELSE NULL
        END as approved_by_email,
        CASE 
          WHEN l.entity_type_name = 'superadmin' THEN sa.mobile_number
          WHEN l.entity_type_name = 'vendors' THEN v.mobile
          WHEN l.entity_type_name = 'employees' THEN aec.mobile_number
          WHEN l.entity_type_name = 'branches' THEN ab.mobile
          ELSE NULL
        END as approved_by_mobile
      FROM leaves AS l
      LEFT JOIN leave_types AS lt ON lt.id = l.leave_type_id
      LEFT JOIN employees AS e ON e.id = l.employee_id
      LEFT JOIN roles AS r ON r.id = e.role_id
      LEFT JOIN employee_departments AS d ON d.id = e.department_id
      LEFT JOIN branches AS b ON b.id = l.branch_id
      LEFT JOIN superadmin_profiles AS sa ON l.entity_type_name = 'superadmin' AND sa.id = l.approved_by_id
      LEFT JOIN vendors AS v ON l.entity_type_name = 'vendors' AND v.id = l.approved_by_id
      LEFT JOIN employees AS ae ON l.entity_type_name = 'employees' AND ae.id = l.approved_by_id
      LEFT JOIN employee_contacts AS aec ON aec.employee_id = ae.id
      LEFT JOIN branches AS ab ON l.entity_type_name = 'branches' AND ab.id = l.approved_by_id
      WHERE 1 = 1
    `;

    const replacements = {};

    // 📅 Date range filter
    if (start_date && end_date) {
      query += ` AND l.leave_date BETWEEN :start_date AND :end_date`;
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    } else if (start_date) {
      query += ` AND l.leave_date >= :start_date`;
      replacements.start_date = start_date;
    } else if (end_date) {
      query += ` AND l.leave_date <= :end_date`;
      replacements.end_date = end_date;
    }

    // 🧾 Leave type filter
    if (leave_type_id) {
      query += ` AND l.leave_type_id = :leave_type_id`;
      replacements.leave_type_id = leave_type_id;
    }

    // 🏢 Branch filter
    if (branch_id) {
      query += ` AND l.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    // 🏛️ Department filter
    if (department_id) {
      query += ` AND e.department_id = :department_id`;
      replacements.department_id = department_id;
    }

    // 🔍 Universal search (in reason, leave_type_name, employee_name, employee_no)
    if (search && search.trim() !== "") {
      query += `
        AND (
          LOWER(l.reason) LIKE :search OR
          LOWER(lt.leave_type_name) LIKE :search OR
          LOWER(e.employee_name) LIKE :search OR
          LOWER(e.employee_no) LIKE :search
        )
      `;
      replacements.search = `%${search.trim().toLowerCase()}%`;
    }

    // 🕒 Order
    query += ` ORDER BY l.leave_date DESC`;

    // Execute raw query
    const rows = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Structure the response with nested objects
    const leaves = rows.map((row) => ({
      id: row.id,
      leave_date: row.leave_date,
      leave_type_id: row.leave_type_id,
      employee_id: row.employee_id,
      branch_id: row.branch_id,
      reason: row.reason,
      status_id: row.status_id,
      approved_by_id: row.approved_by_id,
      entity_type_name: row.entity_type_name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      leave_type_name: row.leave_type_name,
      employee: row.employee_id ? {
        employee_no: row.employee_no,
        employee_name: row.employee_name,
        profile_image_url: row.profile_image_url,
        department_id: row.department_id,
        role_id: row.role_id,
        joining_date: row.joining_date,
        employment_type: row.employment_type,
        gender: row.gender,
        date_of_birth: row.date_of_birth,
        status: row.status,
        role_name: row.role_name,
        department_name: row.department_name,
      } : null,
      branch: row.branch_id ? {
        branch_name: row.branch_name,
        address: row.branch_address,
        mobile: row.branch_mobile,
        email: row.branch_email,
        status: row.branch_status,
      } : null,
      approved_by: row.approved_by_id ? {
        id: row.approved_by_id,
        entity_type: row.entity_type_name,
        name: row.approved_by_name,
        email: row.approved_by_email,
        mobile: row.approved_by_mobile,
      } : null,
    }));

    // Calculate counts by status
    const pending_count = leaves.filter(leave => leave.status_id === 1).length;
    const rejected_count = leaves.filter(leave => leave.status_id === 2).length;
    const approved_count = leaves.filter(leave => leave.status_id === 3).length;

    return commonService.okResponse(res, {
      leaves,
      pending_count,
      rejected_count,
      approved_count
    });
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

module.exports = { getAllLeaves };

// Get leave by ID
const getLeaveById = async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await models.Leave.findByPk(id, {
      paranoid: false
    });

    if (!leave) {
      return commonService.notFound(res, 'Leave request not found');
    }

    return commonService.okResponse(res, leave);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update leave request
const updateLeave = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { leave_date, leave_type_id, reason ,employee_id,branch_id} = req.body;

    const leave = await models.Leave.findByPk(id, { transaction });
    if (!leave) {
      await transaction.rollback();
      return commonService.notFound(res, 'Leave request not found');
    }

    // Prepare updated data
    const updateData = {
      leave_date: leave_date || leave.leave_date,
      leave_type_id: leave_type_id || leave.leave_type_id,
      reason: reason !== undefined ? reason : leave.reason,
      employee_id: employee_id || leave.employee_id,
      branch_id: branch_id || leave.branch_id
    };

    // Update record
    await leave.update(updateData, { transaction });
    await transaction.commit();

    // Fetch updated record (without associations)
    const updatedLeave = await models.Leave.findByPk(id);

    return commonService.okResponse(res, updatedLeave);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

const updateLeaveStatus = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { leave_date, leave_type_id, reason ,employee_id,branch_id,status_id,approved_by_id,entity_type_name  } = req.body;

    const leave = await models.Leave.findByPk(id, { transaction });
    if (!leave) {
      await transaction.rollback();
      return commonService.notFound(res, 'Leave request not found');
    }

    // Prepare updated data
    const updateData = {
      leave_date: leave_date || leave.leave_date,
      leave_type_id: leave_type_id || leave.leave_type_id,
      reason: reason !== undefined ? reason : leave.reason,
      employee_id: employee_id || leave.employee_id,
      branch_id: branch_id || leave.branch_id,
      status_id: status_id || leave.status_id,
      approved_by_id: approved_by_id || leave.approved_by_id,
      entity_type_name: entity_type_name || leave.entity_type_name
    };

    // Update record
    await leave.update(updateData, { transaction });
    await transaction.commit();

    // Fetch updated record (without associations)
    const updatedLeave = await models.Leave.findByPk(id);

    return commonService.okResponse(res, updatedLeave);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};
// Delete leave request (soft delete)
const deleteLeave = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const leave = await models.Leave.findByPk(id, { transaction });
    
    if (!leave) {
      await transaction.rollback();
      return commonService.notFound(res, 'Leave request not found');
    }

    await leave.destroy({ transaction });
    await transaction.commit();
    
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

module.exports = {
  createLeave,
  getAllLeaves,
  getLeaveById,
  updateLeave,
  deleteLeave,
  updateLeaveStatus
};
