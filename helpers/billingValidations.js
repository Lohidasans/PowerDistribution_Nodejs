const { Op } = require('sequelize');
const { models, sequelize } = require('../models');
const { ValidationError } = require("../utils/errors");

const validateProductItemDetails = async (items, transaction) => {
    const pairs = items
        .filter(i => i.product_id && i.product_item_detail_id)
        .map(i => ({
            id: i.product_item_detail_id,
            product_id: i.product_id,
        }));

    if (pairs.length === 0) return;

    const existing = await models.ProductItemDetail.findAll({
        where: {
            deleted_at: null,
            [Op.or]: pairs,
        },
        attributes: ["id", "product_id"],
        transaction,
    });

    const existingSet = new Set(
        existing.map(i => `${i.id}-${i.product_id}`)
    );

    const invalidPairs = pairs.filter(
        p => !existingSet.has(`${p.id}-${p.product_id}`)
    );

    if (invalidPairs.length > 0) {
        throw new ValidationError(
            `Invalid product_item_detail_id for product_id: ${invalidPairs
                .map(p => `(product_id: ${p.product_id}, detail_id: ${p.id})`)
                .join(", ")}`
        );
    }
};

const validateProducts = async (items, transaction) => {
    const productIds = [
        ...new Set(
            items
                .map(i => i.product_id)
                .filter(id => id !== null && id !== undefined)
        ),
    ];

    if (productIds.length === 0) return;

    const existingProducts = await models.Product.findAll({
        where: {
            id: { [Op.in]: productIds },
            deleted_at: null,
        },
        attributes: ["id"],
        transaction,
    });

    const existingIds = new Set(existingProducts.map(p => p.id));
    const invalidProductIds = productIds.filter(id => !existingIds.has(id));

    if (invalidProductIds.length > 0) {
        throw new ValidationError(`Invalid product_id(s): ${invalidProductIds.join(", ")}`);
    }
};

const reduceStockForInvoice = async (items, transaction) => {
    for (const item of items) {
        if (!item.product_item_detail_id || item.quantity <= 0) continue;

        const productItemDetail = await models.ProductItemDetail.findByPk(
            item.product_item_detail_id,
            { transaction }
        );

        if (!productItemDetail) {
            throw new ValidationError(`Invalid product_item_detail_id: ${item.product_item_detail_id}`);
        }

        const newQuantity = productItemDetail.quantity - item.quantity;

        if (newQuantity < 0) {
            throw new ValidationError(
                `Insufficient stock for product_item_detail_id: ${item.product_item_detail_id}`
            );
        }

        await productItemDetail.update(
            {
                quantity: newQuantity,
                stock_out_reason: newQuantity === 0 ? "SOLD" : null,
            },
            { transaction }
        );
    }
};

const validateCashPayment = (payments) => {
    const totalCash = payments
        .filter(p => p.payment_mode?.toLowerCase() === 'cash')
        .reduce((sum, p) => sum + (Number(p.amount_received) || 0), 0);

    if (totalCash >= 200000) {
        throw new ValidationError('PAN card is required for cash payments of ₹2,00,000 or more');
    }
};

const updateBillAdjustmentFlags = async (adjustments, transaction) => {
    if (!Array.isArray(adjustments) || adjustments.length === 0) return;

    for (const adj of adjustments) {
        if (!adj.reference_id) continue;

        switch (adj.adjustment_type_id) {
            case 1: // Sales Return
                await models.SalesReturn.update(
                    { is_bill_adjusted: true },
                    { where: { id: adj.reference_id }, transaction }
                );
                break;

            case 2: // Old Jewel
                await models.OldJewel.update(
                    { is_bill_adjusted: true },
                    { where: { id: adj.reference_id }, transaction }
                );
                break;

            default:
                // Future adjustment types can be handled here
                break;
        }
    }
};

const validateInvoiceItems = async ({
    items,
    header,
    transaction,
    isCreate = true,
    excludeInvoiceId = null,
}) => {

    if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError("At least one item is required");
    }

    let invoice = null;

    if (!isCreate) {
        invoice = await models.SalesInvoiceBill.findByPk(excludeInvoiceId, {
            transaction,
        });

        if (!invoice) {
            throw new ValidationError("Invoice not found");
        }

        // if (invoice.status === "Invoice") {
        //     throw new ValidationError("Finalized invoice cannot be edited");
        // }
    }

    // invoice_no uniqueness (only on create or when changed)
    if (header.invoice_no) {
        const where = {
            invoice_no: header.invoice_no,
            deleted_at: null,
        };

        if (!isCreate) {
            where.id = { [Op.ne]: excludeInvoiceId };
        }

        const existing = await models.SalesInvoiceBill.findOne({
            where,
            transaction,
        });

        if (existing) {
            throw new ValidationError("Invoice no already exists");
        }
    }

    // product_item_detail_id required
    const invalidItems = items.filter(i => !i.product_item_detail_id);
    if (invalidItems.length > 0) {
        throw new ValidationError("product_item_detail_id is required for all items");
    }

    return invoice; // IMPORTANT
};

const validateEstimateForInvoice = async (
    estimateBillId,
    { models, transaction }
) => {
    if (!estimateBillId) {
        return null; // No estimate reference, valid case
    }

    const estimateBill = await models.EstimateBill.findOne({
        where: {
            id: estimateBillId,
            deleted_at: null,
        },
        transaction,
    });

    if (!estimateBill) {
        throw new ValidationError("Invalid Estimate Reference");
    }

    if (estimateBill.is_converted) {
        throw new ValidationError("Estimate has already been converted to an invoice");
    }

    return estimateBill;
};

const markEstimateAsConverted = async (
    estimateBill,
    { transaction }
) => {
    if (!estimateBill) return;

    await estimateBill.update(
        {
            is_converted: true,
            converted_at: new Date(),
            status: "Converted",
        },
        { transaction }
    );
};

module.exports = {
    validateProductItemDetails,
    validateProducts,
    reduceStockForInvoice,
    validateCashPayment,
    updateBillAdjustmentFlags,
    validateInvoiceItems,
    validateEstimateForInvoice,
    markEstimateAsConverted
};