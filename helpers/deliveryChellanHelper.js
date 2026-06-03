const { Op } = require('sequelize');
const { models, sequelize } = require('../models');
const { ValidationError } = require("../utils/errors");


const reduceDeliveryChallanStock = async (
  productItemId,
  quantity,
  deliveryChallanId,
  transaction
) => {
  const productItem = await models.ProductItemDetail.findByPk(
    productItemId,
    { transaction }
  );

  if (!productItem) {
    throw new Error(
      `Product Item ${productItemId} not found`
    );
  }

  if (Number(productItem.quantity) < Number(quantity)) {
    throw new Error(
      `Insufficient stock for SKU ${productItem.sku_id || productItemId}`
    );
  }

  await productItem.update(
    {
      quantity:
        Number(productItem.quantity) - Number(quantity),

      delivery_challan_id: deliveryChallanId,

      delivery_challan_qty:
        Number(productItem.delivery_challan_qty || 0) +
        Number(quantity),

      is_delivery_challan_issued: true,
    },
    { transaction }
  );

  return productItem;
};

const restoreDeliveryChallanStock = async (
  productItemId,
  quantity,
  transaction
) => {
  const productItem = await models.ProductItemDetail.findByPk(
    productItemId,
    { transaction }
  );

  if (!productItem) return;

  await productItem.update(
    {
      quantity:
        Number(productItem.quantity) + Number(quantity),

      delivery_challan_qty: Math.max(
        0,
        Number(productItem.delivery_challan_qty || 0) -
          Number(quantity)
      ),
    },
    { transaction }
  );

  return productItem;
};


module.exports = {
    reduceDeliveryChallanStock,
    restoreDeliveryChallanStock
}