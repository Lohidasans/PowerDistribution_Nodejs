const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

const createEmployee = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      profile_image_url,
      employee_no,
      employee_name,
      department_id,
      designation_id,
      joining_date,
      employment_type,
      gender,
      date_of_birth,
      branch_id,
      status,
      contact,
    } = req.body;

    if (!employee_no || !employee_name || !department_id || !designation_id) {
      await transaction.rollback();
      return commonService.badRequest(res, enMessage.failure.requiredFields);
    }

    // Create employee
    const employee = await models.Employee.create(
      {
        profile_image_url,
        employee_no,
        employee_name,
        department_id,
        designation_id,
        joining_date,
        employment_type,
        gender,
        date_of_birth,
        branch_id,
        status,
      },
      { transaction }
    );

    // Create contact if provided
    let createdContact = null;
    if (contact && typeof contact === "object") {
      createdContact = await createEmployeeContact(
        employee.id,
        contact,
        transaction
      );
    }

    await transaction.commit();

    // Nested response
    const response = {
      employee: {
        ...employee.get({ plain: true }),
        contacts: createdContact ? createdContact.get({ plain: true }) : null,
      },
    };

    return commonService.createdResponse(res, response);
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

const createEmployeeContact = async (
  employeeId,
  contactData,
  transaction = null
) => {
  const contact = await models.EmployeeContact.create(
    {
      employee_id: employeeId,
      mobile_number: contactData.mobile_number,
      email_id: contactData.email_id,
      address: contactData.address,
      country_id: contactData.country_id,
      state_id: contactData.state_id,
      district_id: contactData.district_id,
      pin_code: contactData.pin_code,
      emergency_contact_person: contactData.emergency_contact_person,
      relationship: contactData.relationship,
      emergency_contact_number: contactData.emergency_contact_number,
    },
    transaction ? { transaction } : {}
  );

  return contact;
};

// List employees with optional simple filters
const listEmployees = async (req, res) => {
  try {
    const { branch_id, department_id, designation_id, search } = req.query;

    let query = `
      SELECT 
        e.*,
        b.branch_name,
        d.department_name,
        des.designation_name,
        c.mobile_number,
        c.email_id,
        c.address,
        c.country_id,
        c.state_id,
        c.district_id,
        c.pin_code,
        c.emergency_contact_person,
        c.relationship,
        c.emergency_contact_number,
        coun.country_name,
        s.state_name,
        dist.district_name
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN "employee_departments" d ON d.id = e.department_id
      LEFT JOIN "employee_designations" des ON des.id = e.designation_id
      LEFT JOIN employee_contacts c ON c.employee_id = e.id
      LEFT JOIN countries coun ON coun.id = c.country_id::int
      LEFT JOIN states s ON s.id = c.state_id::int
      LEFT JOIN districts dist ON dist.id = c.district_id::int
      WHERE e.deleted_at IS NULL
    `;

    const replacements = {};

    if (branch_id) {
      query += ` AND e.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }
    if (department_id) {
      query += ` AND e.department_id = :department_id`;
      replacements.department_id = department_id;
    }
    if (designation_id) {
      query += ` AND e.designation_id = :designation_id`;
      replacements.designation_id = designation_id;
    }
    if (search) {
      query += ` AND (e.employee_name ILIKE :search OR e.employee_no ILIKE :search)`;
      replacements.search = `%${search}%`;
    }

    query += ` ORDER BY e.employee_name ASC`;

    // Sequelize query
    const rows = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Nest contact info
    const employees = rows.map((emp) => ({
      ...emp,
      contacts: {
        mobile_number: emp.mobile_number,
        email_id: emp.email_id,
        address: emp.address,
        country_id: emp.country_id,
        state_id: emp.state_id,
        district_id: emp.district_id,
        pin_code: emp.pin_code,
        emergency_contact_person: emp.emergency_contact_person,
        relationship: emp.relationship,
        emergency_contact_number: emp.emergency_contact_number,
        country_name: emp.country_name,
        state_name: emp.state_name,
        district_name: emp.district_name,
      },
    }));

    return commonService.okResponse(res, { employees });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await models.Employee.findOne({
      where: { id },
      include: [
        { model: models.EmployeeContact, as: "contact" },
        {
          model: models.Branch,
          as: "branch",
          attributes: ["id", "branch_name"],
        },
        {
          model: models.EmployeeDepartment,
          as: "department",
          attributes: ["id", "department_name"],
        },
        {
          model: models.EmployeeDesignation,
          as: "designation",
          attributes: ["id", "designation_name"],
        },
      ],
    });

    if (!employee)
      return commonService.notFound(res, enMessage.failure.recordNotFound);

    const response = {
      employee: employee.get({ plain: true }),
    };

    return commonService.okResponse(res, response);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listEmployeeDropdown = async (req, res) => {
  try {
    const { branch_id, department_id, designation_id } = req.query;

    const where = { deleted_at: null };
    if (branch_id) where.branch_id = branch_id;
    if (department_id) where.department_id = department_id;
    if (designation_id) where.designation_id = designation_id;

    const employees = await models.Employee.findAll({
      attributes: ["id", "employee_name"],
      where,
      order: [["employee_name", "ASC"]],
    });

    return commonService.okResponse(res, { employees });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateEmployee = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const employee = await models.Employee.findByPk(id);
    if (!employee) {
      await transaction.rollback();
      return commonService.notFound(res, enMessage.failure.recordNotFound);
    }

    const {
      profile_image_url,
      employee_no,
      employee_name,
      department_id,
      designation_id,
      joining_date,
      employment_type,
      gender,
      date_of_birth,
      branch_id,
      status,
      contact,
    } = req.body;

    await employee.update(
      {
        profile_image_url,
        employee_no,
        employee_name,
        department_id,
        designation_id,
        joining_date,
        employment_type,
        gender,
        date_of_birth,
        branch_id,
        status,
      },
      { transaction }
    );

    let updatedContact = null;
    if (contact && typeof contact === "object") {
      const existingContact = await models.EmployeeContact.findOne({
        where: { employee_id: id },
      });

      if (existingContact) {
        updatedContact = await existingContact.update(contact, { transaction });
      } else {
        updatedContact = await createEmployeeContact(id, contact, transaction);
      }
    }

    await transaction.commit();

    const response = {
      employee: {
        ...employee.get({ plain: true }),
        contacts: updatedContact ? updatedContact.get({ plain: true }) : null,
      },
    };

    return commonService.okResponse(res, response);
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await models.Employee.findByPk(id);

    if (!employee)
      return commonService.notFound(res, enMessage.failure.recordNotFound);

    await employee.destroy();
    return commonService.okResponse(res, {
      message: enMessage.success.deleted,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createEmployee,
  listEmployees,
  getEmployeeById,
  listEmployeeDropdown,
  updateEmployee,
  deleteEmployee,
};
