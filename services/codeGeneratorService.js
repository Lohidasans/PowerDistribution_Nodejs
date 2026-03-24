const { models } = require("../models");
const commonService = require("./commonService");
const { generateBranchSeriesCode } = require("../helpers/codeGeneration");
const documentConfig = require("../helpers/configs/documentConfig");

const generateCode = async (req, res) => {
    try {
        const { branch_id, type_id } = req.query;

        if (!branch_id || !type_id) {
            return commonService.badRequest(
                res,
                "branch_id and type_id are required"
            );
        }

        // Fetch setting using IDs
        const setting = await models.InvoiceSetting.findOne({
            where: {
                branch_id,
                invoice_sequence_name_id: type_id,
            },
            include: [
                {
                    model: models.InvoiceSettingEnum,
                    as: "invoiceSequenceName",
                    where: {
                        status: "Active",
                    },
                    required: true,
                },
            ],
        });

        if (!setting) {
            return commonService.badRequest(
                res,
                "No invoice setting found for given branch and type"
            );
        }

        // Prefix & start number
        const prefix = (setting.invoice_prefix || "").toUpperCase();
        const startNo = setting.invoice_start_no || setting.invoice_suffix || "001";

        // Get model + field using ID
        const config = documentConfig[type_id];

        if (!config) {
            return commonService.badRequest(res, "Invalid type_id");
        }

        const { model, field } = config;

        // Generate number
        const code = await generateBranchSeriesCode(
            model,
            field,
            prefix,
            startNo
        );

        return commonService.okResponse(res, { unique_code: code });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

const getInvoiceTypes = async (req, res) => {
    try {
        const { status = "Active" } = req.query;

        const where = {};

        // Filter by status (optional)
        if (status) {
            where.status = status;
        }

        const invoiceTypes = await models.InvoiceSettingEnum.findAll({
            where,
            attributes: [
                "id",
                "invoice_setting_enum",
                "status",
            ],
            order: [["id", "ASC"]],
        });

        return commonService.okResponse(res, invoiceTypes);
    } catch (err) {
        return commonService.handleError(res, err);
    }
};
module.exports = {
    generateCode,
    getInvoiceTypes
};