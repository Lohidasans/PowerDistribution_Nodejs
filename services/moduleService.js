const { models } = require("../models");
const commonService = require("../services/commonService");

const getModulesByGroupId = async (req, res) => {
    try {
        const { moduleGroupId } = req.params;

        if (!moduleGroupId) {
            return commonService.badRequest(res, "moduleGroupId is required");
        }

        // 1️. Fetch module group
        const moduleGroup = await models.ModuleGroup.findOne({
            where: { id: moduleGroupId },
            attributes: ["id", "module_group_name"],
        });

        if (!moduleGroup) {
            return commonService.notFound(res, "Module group not found");
        }

        // 2️. Fetch modules in that group
        const modules = await models.Module.findAll({
            where: { module_group_id: moduleGroupId },
            attributes: ["id", "module_group_id", "module_name"],
            order: [["id", "ASC"]],
        });

        return commonService.okResponse(res, {
            module_group: moduleGroup,
            modules: modules
        });

    } catch (error) {
        return commonService.handleError(res, error);
    }
};

module.exports = {
    getModulesByGroupId,
};

