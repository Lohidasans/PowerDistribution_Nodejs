const { models } = require("../models/index");
const message = require("../constants/en.json");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const { buildSearchCondition } = require("../helpers/queryHelper");

// Create a new Branch
const createBranch = async (req, res) => {
    try {
        const { branch_no, branch_name, ...rest } = req.body;

        // Validate required fields
        if (!branch_no || !branch_name) {
            return commonService.badRequest(res, message.branch.required);
        }

        // Enforce unique branch_no
        const existing = await models.Branch.findOne({ where: { branch_no } });
        if (existing) {
            return commonService.badRequest(res, message.branch.duplicateNo);
        }
        const branch = await models.Branch.create({branch_no, branch_name, ...rest,});

        return commonService.createdResponse(res, { branch });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// List branches with optional search and status filter
const listBranches = async (req, res) => {
    try {
        const searchKey = req.query.search || "";
        const status = req.query.status || "";
        const city = req.query.city || "";

        const where = {};
        // Add search condition
        const searchCondition = buildSearchCondition(searchKey, ["branch_no", "branch_name", "contact_person", "city", "state"]);
        if (searchCondition) {
            Object.assign(where, searchCondition);
        }
        // Add filters
        if (status) where.status = status;
        if (city) where.city = city; 

        const branches = await models.Branch.findAll({ where, order: [["created_at", "DESC"]], });
        return commonService.okResponse(res, { branches });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Get a single branch by ID
const getBranchById = async (req, res) => {
    try {
        const branch = await commonService.findById(models.Branch, req.params.id, res);
        if (!branch) return;
        return commonService.okResponse(res, { branch });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Update a branch
const updateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const branch = await commonService.findById(models.Branch, id, res);
        if (!branch) return;

        const { branch_no } = req.body;
        if (branch_no && branch_no !== branch.branch_no) {
            const exists = await models.Branch.findOne({ where: { branch_no, id: { [Op.ne]: id } } });
            if (exists) return commonService.badRequest(res, message.branch.duplicateNo);
        }

        await branch.update(req.body);
        return commonService.okResponse(res, { branch });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};


// Soft delete a branch
const deleteBranch = async (req, res) => {
    try {
        const branch = await commonService.findById(models.Branch, req.params.id, res);
        if (!branch) return;
        await branch.destroy();
        return commonService.noContentResponse(res);
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
};
