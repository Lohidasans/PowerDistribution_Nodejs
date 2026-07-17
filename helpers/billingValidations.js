const { Op } = require('sequelize');
const { models, sequelize } = require('../models');
const { ValidationError } = require("../utils/errors");

const validateDuplicateUniqueCode = async ({
  model,
  billField,
  billValue,
  employee_id,
  transaction,
  bill_name,
  exclude_id = null,
}) => {

  // REQUIRED VALIDATION
  if (!billValue) {
    throw new Error(`${bill_name} number is required`);
  }

  // Employee Validation
  const employee = await models.Employee.findOne({
    where: {
      id: employee_id,
      deleted_at: null,
    },
    transaction,
  });

  if (!employee) {
    throw new Error("Employee not found");
  }

  const where = {
    [billField]: billValue,
    branch_id: employee.branch_id,
    deleted_at: null,
  };

  if (exclude_id) {
    where.id = {
      [Op.ne]: exclude_id,
    };
  }

  console.log("DUPLICATE WHERE => ", where);

  const existing = await model.findOne({
    where,
    transaction,
  });

  console.log("EXISTING => ", existing);

  if (existing) {
    throw new Error(
      `${bill_name} number already exists for this branch`
    );
  }

  return employee;
};

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

const restoreStockForInvoice = async (items, transaction) => {
    for (const item of items) {
        if (!item.product_item_detail_id || item.quantity <= 0) continue;

        const productItemDetail = await models.ProductItemDetail.findByPk(
            item.product_item_detail_id,
            { transaction }
        );

        if (!productItemDetail) {
            throw new ValidationError(
                `Invalid product_item_detail_id: ${item.product_item_detail_id}`
            );
        }

        const newQuantity = productItemDetail.quantity + item.quantity;

        await productItemDetail.update(
            {
                quantity: newQuantity,
                stock_out_reason: null, // restoring stock
            },
            { transaction }
        );
    }
};


const validateCashPayment = (payments, panNo) => {

    const totalCash = payments
        .filter(p => p.payment_mode?.toLowerCase() === 'cash')
        .reduce((sum, p) => sum + (Number(p.amount_received) || 0), 0);

    if (totalCash >= 200000 && !panNo?.trim()) {
        throw new ValidationError(
            'PAN card is required for cash payments of ₹2,00,000 or more'
        );
    }
}

const lockBillAdjustmentFlags = async (adjustments, transaction) => {
    if (!Array.isArray(adjustments) || adjustments.length === 0) return;

    for (const adj of adjustments) {
        if (!adj.reference_id) continue;

        switch (adj.adjustment_type_id) {
            case 1: // Sales Return
                await models.SalesReturn.update(
                    { is_bill_adjusted: true,updated_at: new Date(), },
                    { where: { id: adj.reference_id }, transaction }
                );
                break;

            case 2: // Old Jewel
                await models.OldJewel.update(
                    { is_bill_adjusted: true,updated_at: new Date(), },
                    { where: { id: adj.reference_id }, transaction }
                );
                break;
            
            case 3: // Scheme
                await models.Enrollment.update(
                    { is_bill_adjusted: true,updated_at: new Date(), },
                    { where: { id: adj.reference_id }, transaction }
                );
                break;

            default:
                // Future adjustment types can be handled here
                break;
        }
    }
};

const unlockBillAdjustmentFlags = async (adjustments, transaction) => {
    if (!Array.isArray(adjustments) || adjustments.length === 0) return;

    for (const adj of adjustments) {
        if (!adj.reference_id) continue;

        switch (Number(adj.adjustment_type_id)) {

            case 1: // Sales Return
                await models.SalesReturn.update(
                    { is_bill_adjusted: false, updated_at: new Date(), },
                    {
                        where: { id: adj.reference_id },
                        transaction
                    }
                );
                break;

            case 2: // Old Jewel
           await models.OldJewel.update(
                    { is_bill_adjusted: false, updated_at: new Date(), },
                    {
                        where: { id: adj.reference_id },
                        transaction
                    }
                );
                break;

            case 3: // Scheme
                await models.Enrollment.update(
                    { is_bill_adjusted: false, updated_at: new Date(), },
                    {
                        where: { id: adj.reference_id },
                        transaction
                    }
                );
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
    }

    // product_item_detail_id required
    const invalidItems = items.filter(i => !i.product_item_detail_id);
    if (invalidItems.length > 0) {
        throw new ValidationError("product_item_detail_id is required for all items");
    }

    return invoice;
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
    { transaction, employee_id }
) => {
    if (!estimateBill) return;

    await estimateBill.update(
        {
            is_converted: true,
            converted_at: new Date(),
            converted_by: employee_id,
            status: "Converted",
        },
        { transaction }
    );
};

const restoreStockForSalesReturn = async (items, transaction) => {
    for (const item of items) {
        if (!item.product_item_detail_id || Number(item.quantity) <= 0) continue;

        const productItemDetail = await models.ProductItemDetail.findByPk(
            item.product_item_detail_id,
            { transaction }
        );

        if (!productItemDetail) {
            throw new ValidationError(
                `Invalid product_item_detail_id: ${item.product_item_detail_id}`
            );
        }

        await productItemDetail.update(
            {
                quantity: productItemDetail.quantity + Number(item.quantity),
                stock_out_reason: null,
            },
            { transaction }
        );
    }
};

const isPostedSalesReturn = (status) => status === "Printed";

const groupQuantityByInvoiceItem = (items = []) => {
  const quantities = new Map();

  for (const item of items) {
    const id = Number(item.invoice_bill_item_id);
    const qty = Number(item.quantity || 0);

    if (!id || qty <= 0) continue;

    quantities.set(id, (quantities.get(id) || 0) + qty);
  }

  return quantities;
};

const applySalesReturnDeltas = async ({
  oldItems = [],
  newItems = [],
  previousStatus,
  nextStatus,
  transaction,
}) => {
  const oldQuantities = isPostedSalesReturn(previousStatus)
    ? groupQuantityByInvoiceItem(oldItems)
    : new Map();

  const newQuantities = isPostedSalesReturn(nextStatus)
    ? groupQuantityByInvoiceItem(newItems)
    : new Map();

  const invoiceItemIds = new Set([
    ...oldQuantities.keys(),
    ...newQuantities.keys(),
  ]);

  for (const invoiceBillItemId of invoiceItemIds) {
    const oldQty = Number(oldQuantities.get(invoiceBillItemId) || 0);
    const newQty = Number(newQuantities.get(invoiceBillItemId) || 0);
    const delta = newQty - oldQty;

    if (delta === 0) continue;

    // Locks the exact original invoice line.
    const invoiceItem = await models.SalesInvoiceBillItem.findByPk(
      invoiceBillItemId,
      {
        transaction,
        lock: transaction.LOCK.UPDATE,
      }
    );

    if (!invoiceItem) {
      throw new ValidationError("Original invoice item was not found");
    }

    const currentReturnedQty = Number(invoiceItem.returned_quantity || 0);
    const updatedReturnedQty = currentReturnedQty + delta;
    const soldQty = Number(invoiceItem.quantity || 0);

    if (updatedReturnedQty < 0) {
      throw new ValidationError("Invalid return quantity reversal");
    }

    if (updatedReturnedQty > soldQty) {
      const availableQty = soldQty - currentReturnedQty;

      throw new ValidationError(
        `Only ${Math.max(availableQty, 0)} quantity is available for return`
      );
    }

    const productItemDetail = await models.ProductItemDetail.findByPk(
      invoiceItem.product_item_detail_id,
      {
        transaction,
        lock: transaction.LOCK.UPDATE,
      }
    );

    if (!productItemDetail) {
      throw new ValidationError("Product stock item was not found");
    }

    // delta > 0: return is posted / quantity increased → add stock
    // delta < 0: return is unposted / reduced / deleted → deduct stock
    const newStockQty = Number(productItemDetail.quantity || 0) + delta;

    if (newStockQty < 0) {
      throw new ValidationError(
        "Cannot reverse this return because the restored stock has already been used"
      );
    }

    await invoiceItem.update(
      {
        returned_quantity: updatedReturnedQty,
        is_returned: updatedReturnedQty >= soldQty,
      },
      { transaction }
    );

    await productItemDetail.update(
      {
        quantity: newStockQty,
        stock_out_reason: newStockQty === 0 ? "SOLD" : null,
      },
      { transaction }
    );
  }
};


module.exports = {
    validateDuplicateUniqueCode,
    validateProductItemDetails,
    validateProducts,
    reduceStockForInvoice,
    validateCashPayment,
    lockBillAdjustmentFlags,
    unlockBillAdjustmentFlags,
    validateInvoiceItems,
    validateEstimateForInvoice,
    markEstimateAsConverted,
    restoreStockForInvoice,
    restoreStockForSalesReturn,
    applySalesReturnDeltas,
};