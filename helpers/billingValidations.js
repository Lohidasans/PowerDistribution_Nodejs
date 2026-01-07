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

const validateStock = async (items, transaction) => {
    for (const item of items) {
        if (item.product_item_detail_id && item.quantity > 0) {
            const productItem = await models.ProductItemDetail.findByPk(
                item.product_item_detail_id,
                {
                    transaction,
                    attributes: ['id', 'quantity']
                }
            );

            if (!productItem) {
                throw new Error(`Product item detail not found: ${item.product_item_detail_id}`);
            }

            if (productItem.quantity < item.quantity) {
                throw new Error(`Insufficient stock for item ${item.product_item_detail_id}. Available: ${productItem.quantity}, Requested: ${item.quantity}`);
            }
        }
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

const validateAdjustments = async (adjustments, invoiceTotal, transaction) => {
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
        return 0; // No adjustments
    }

    const totalAdjustment = adjustments.reduce(
        (sum, adj) => sum + (Number(adj.adjustment_amount) || 0),
        0
    );

    if (totalAdjustment > invoiceTotal) {
        throw new Error(`Total adjustment amount (${totalAdjustment}) cannot exceed invoice total (${invoiceTotal})`);
    }

    // Validate adjustment references
    for (const adj of adjustments) {
        if (adj.reference_id) {
            let isValid = false;
            if (adj.adjustment_type_id === 1) { // Sales Return
                const sr = await models.SalesReturn.findByPk(adj.reference_id, {
                    transaction,
                    attributes: ['id', 'is_bill_adjusted']
                });
                isValid = !!sr && !sr.is_bill_adjusted;
            } else if (adj.adjustment_type_id === 2) { // Old Jewel
                const oj = await models.OldJewel.findByPk(adj.reference_id, {
                    transaction,
                    attributes: ['id', 'is_bill_adjusted']
                });
                isValid = !!oj && !oj.is_bill_adjusted;
            }

            if (!isValid) {
                throw new Error(`Invalid or already used reference ID: ${adj.reference_id} for adjustment type ${adj.adjustment_type_id}`);
            }
        }
    }

    return totalAdjustment;
};

module.exports = {
    validateProductItemDetails,
    validateProducts,
    validateStock,
    validateCashPayment,
    validateAdjustments
};