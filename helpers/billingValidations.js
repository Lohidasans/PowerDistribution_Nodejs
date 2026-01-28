const { Op } = require('sequelize');
const { models, sequelize } = require('../models');

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
        throw new Error(
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
        throw new Error(`Invalid product_id(s): ${invalidProductIds.join(", ")}`);
    }
};

const reduceStockForInvoice = async (items, status, payments, transaction) => {
    if (status !== "Invoice" || !payments || payments.length === 0) return;

    for (const item of items) {
        if (!item.product_item_detail_id || item.quantity <= 0) continue;

        const productItemDetail = await models.ProductItemDetail.findByPk(
            item.product_item_detail_id,
            { transaction }
        );

        if (!productItemDetail) {
            throw new Error(`Invalid product_item_detail_id: ${item.product_item_detail_id}`);
        }

        const newQuantity = productItemDetail.quantity - item.quantity;

        if (newQuantity < 0) {
            throw new Error(
                `Insufficient stock for product_item_detail_id: ${item.product_item_detail_id}`
            );
        }

        await productItemDetail.update(
            { quantity: newQuantity },
            { transaction }
        );
    }
};

const validateCashPayment = (payments) => {
    const totalCash = payments
        .filter(p => p.payment_mode?.toLowerCase() === 'cash')
        .reduce((sum, p) => sum + (Number(p.amount_received) || 0), 0);

    if (totalCash >= 200000) {
        throw new Error('PAN card is required for cash payments of ₹2,00,000 or more');
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


module.exports = {
    validateProductItemDetails,
    validateProducts,
    reduceStockForInvoice,
    validateCashPayment,
    updateBillAdjustmentFlags
};