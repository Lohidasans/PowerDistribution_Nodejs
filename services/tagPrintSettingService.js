const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");

const getSettings = async (req, res) => {
    try {
        const { entity_id, entity_type } = req.query;

        if (!entity_id || !entity_type) {
            return commonService.badRequest(res, "entity_id and entity_type are required");
        }

        const record = await models.TagPrintSetting.findOne({
            where: { entity_id, entity_type },
        });

        if (!record) {
            return commonService.okResponse(res, { settings: null });
        }

        return commonService.okResponse(res, { settings: record.settings });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

const saveSettings = async (req, res) => {
    try {
        const { entity_id, entity_type, ...settings } = req.body;

        if (!entity_id || !entity_type) {
            return commonService.badRequest(res, "entity_id and entity_type are required");
        }

        await sequelize.query(
            `INSERT INTO tag_print_settings (entity_id, entity_type, settings, created_at, updated_at)
             VALUES (:entity_id, :entity_type, :settings, NOW(), NOW())
             ON CONFLICT (entity_id, entity_type)
             DO UPDATE SET settings = :settings, updated_at = NOW()`,
            {
                replacements: {
                    entity_id,
                    entity_type,
                    settings: JSON.stringify(settings),
                },
            }
        );

        return commonService.okResponse(res, { message: "Settings saved successfully" });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

module.exports = {
    getSettings,
    saveSettings,
};
