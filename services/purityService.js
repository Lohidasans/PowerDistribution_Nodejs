const { models, sequelize } = require("../models");
const commonService = require("./commonService");

// Create a new purity
const createPurity = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { purity_value } = req.body;

        if (!purity_value) {
            await transaction.rollback();
            return commonService.badRequest(res, "purity_value is required");
        }

        // Check if purity already exists (including soft-deleted)
        const existingPurity = await models.Purity.findOne({
            where: { purity_value },
            paranoid: false,
        });

        if (existingPurity) {
            await transaction.rollback();
            return commonService.conflict(
                res,
                "Purity with this value already exists"
            );
        }

        const purity = await models.Purity.create(
            { purity_value },
            { transaction }
        );

        await transaction.commit();
        return commonService.createdResponse(res, purity);
    } catch (error) {
        await transaction.rollback();
        return commonService.handleError(res, error);
    }
};

// Get all purities
const getAllPurities = async (req, res) => {
    try {
        const purities = await models.Purity.findAll({
            order: [["purity_value", "ASC"]],
            attributes: ["id", "purity_value"],
        });

        return commonService.okResponse(res, purities);
    } catch (error) {
        return commonService.handleError(res, error);
    }
};

// Get purity by ID
const getPurityById = async (req, res) => {
    try {
        const { id } = req.params;

        const purity = await models.Purity.findByPk(id);

        if (!purity) {
            return commonService.notFound(res, "Purity not found");
        }

        return commonService.okResponse(res, purity);
    } catch (error) {
        return commonService.handleError(res, error);
    }
};

// Update purity
const updatePurity = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { purity_value } = req.body;

        const purity = await models.Purity.findByPk(id, { transaction });

        if (!purity) {
            await transaction.rollback();
            return commonService.notFound(res, "Purity not found");
        }

        // Check for duplicate purity value
        if (purity_value && purity_value !== purity.purity_value) {
            const existingPurity = await models.Purity.findOne({
                where: { purity_value },
                paranoid: false,
            });

            if (existingPurity) {
                await transaction.rollback();
                return commonService.conflict(
                    res,
                    "Another purity with this value already exists"
                );
            }
        }

        await purity.update({ purity_value }, { transaction });
        await transaction.commit();

        const updatedPurity = await models.Purity.findByPk(id);
        return commonService.okResponse(res, updatedPurity);
    } catch (error) {
        await transaction.rollback();
        return commonService.handleError(res, error);
    }
};

// Delete purity (soft delete)
const deletePurity = async (req, res) => {
    try {
        const { id } = req.params;

        const purity = await models.Purity.findByPk(id);

        if (!purity) {
            return commonService.notFound(res, "Purity not found");
        }

        await purity.destroy(); // soft delete

        return commonService.noContentResponse(res);
    } catch (error) {
        return commonService.handleError(res, error);
    }
};

module.exports = {
    createPurity,
    getAllPurities,
    getPurityById,
    updatePurity,
    deletePurity,
};
