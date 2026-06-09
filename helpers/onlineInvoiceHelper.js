const { Op } = require('sequelize');
const { models, sequelize } = require('../models');
const { ValidationError } = require("../utils/errors");


const buildInvoiceSummary = (items) => {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const taxAmount = items.reduce(
    (sum, item) => sum + Number(item.tax_amount || 0),
    0
  );

  const discountAmount = items.reduce(
    (sum, item) => sum + Number(item.discount_amount || 0),
    0
  );

  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  return {
    subtotal: subtotal.toFixed(2),
    cgst: (taxAmount / 2).toFixed(2),
    sgst: (taxAmount / 2).toFixed(2),
    tax_amount: taxAmount.toFixed(2),
    discount: discountAmount.toFixed(2),
    shipping_charge: "0.00",
    total_amount: (
      subtotal +
      taxAmount -
      discountAmount
    ).toFixed(2),
    total_quantity: totalQuantity,
  };
};

const getSalesInvoiceType = async () => {
  const salesInvoiceType =
    await models.InvoiceSettingEnum.findOne({
      where: {
        invoice_setting_enum: "Sales Invoice",
        status: "Active",
      },
      attributes: ["id", "invoice_setting_enum"],
      raw: true,
    });

  if (!salesInvoiceType) {
    throw new Error("Sales Invoice type not found");
  }

  return salesInvoiceType;
};


module.exports = {
    buildInvoiceSummary,
    getSalesInvoiceType
}