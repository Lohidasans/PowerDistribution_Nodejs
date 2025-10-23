const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const message = require("../constants/en.json");

// Create employee basic record
const createEmployee = async (req, res) => {
  try {
    const required = [
      "employee_no",
      "employee_name",
      "department_id",
      "designation_id",
      "joining_date",
      "employment_type",
      "gender",
      "date_of_birth",
      "branch_id",
    ];

    for (const f of required) {
      if (req.body?.[f] === undefined || req.body?.[f] === null || req.body?.[f] === "") {
        return commonService.badRequest(res, message.failure.requiredFields);
      }
    }

    const payload = {
      profile_image_url: req.body.profile_image_url,
      employee_no: req.body.employee_no,
      employee_name: req.body.employee_name,
      department_id: +req.body.department_id,
      designation_id: +req.body.designation_id,
      joining_date: req.body.joining_date,
      employment_type: req.body.employment_type,
      gender: req.body.gender,
      date_of_birth: req.body.date_of_birth,
      branch_id: +req.body.branch_id,
      status: req.body.status || "Active",
    };

    const employee = await models.Employee.create(payload);
    return commonService.createdResponse(res, { employee });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List employees with optional simple filters
const listEmployees = async (req, res) => {
  try {
    const { branch_id, department_id, designation_id, search } = req.query;

    let query = `
      SELECT e.*, b.branch_name, d.department_name, des.designation_name
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN "employeeDepartments" d ON d.id = e.department_id
      LEFT JOIN "employeeDesignations" des ON des.id = e.designation_id
      WHERE e.deleted_at IS NULL`;

    const replacements = {};

    if (branch_id) { query += ` AND e.branch_id = :branch_id`; replacements.branch_id = +branch_id; }
    if (department_id) { query += ` AND e.department_id = :department_id`; replacements.department_id = +department_id; }
    if (designation_id) { query += ` AND e.designation_id = :designation_id`; replacements.designation_id = +designation_id; }
    if (search) {
      const like = `%${search}%`;
      query += ` AND (e.employee_name ILIKE :like OR e.employee_no ILIKE :like)`;
      replacements.like = like;
    }

    query += ` ORDER BY e.employee_name ASC`;

    const [rows] = await sequelize.query(query, { replacements });
    return commonService.okResponse(res, { employees: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = { createEmployee, listEmployees };
