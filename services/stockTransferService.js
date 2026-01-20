const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { Op } = require("sequelize");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const ProductService = require("../services/productService");

// Generate auto code: TRA001
const generateStockCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.StockTransfer,
      "transfer_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { stock_transfer_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

//BASIC REQUEST VALIDATION
const validateRequiredFields = async (req, transaction) => {
  const requiredFields = [
    "transfer_no",
    "date",
    "branch_from",
    "branch_to",
    "reference_no",
    "created_by",
  ];

  for (const field of requiredFields) {
    if (!req.body[field]) {
      throw new Error(`${field} is required`);
    }
  }
};

//UNIQUE TRANSFER NO
const validateUniqueTransferNo = async (transfer_no, transaction) => {
  const existing = await models.StockTransfer.findOne({
    where: { transfer_no, deleted_at: null },
    transaction,
  });

  if (existing) {
    throw new Error("Stock Transfer code already exists");
  }
};

//BRANCH VALIDATION
const validateBranches = async (branch_from, branch_to, transaction) => {
  if (branch_from === branch_to) {
    throw new Error("Source and destination branch cannot be the same");
  }

  const branches = await models.Branch.findAll({
    where: {
      id: { [Op.in]: [branch_from, branch_to] },
      deleted_at: null,
    },
    attributes: ["id"],
    raw: true,
    transaction,
  });

  const ids = branches.map(b => b.id);

  if (!ids.includes(branch_from)) {
    throw new Error("Invalid branch_from Id");
  }

  if (!ids.includes(branch_to)) {
    throw new Error("Invalid branch_to Id");
  }
};

// PRODUCT & ITEM DETAIL VALIDATION
const validateProductsAndItemDetails = async (
  items,
  productIds,
  itemDetailIds,
  transaction
) => {
  // Products
  const products = await models.Product.findAll({
    where: { id: { [Op.in]: productIds }, deleted_at: null },
    attributes: ["id"],
    raw: true,
    transaction,
  });

  const validProductIds = products.map(p => p.id);
  const invalidProduct = items.find(i => !validProductIds.includes(i.product_id));

  if (invalidProduct) {
    await transaction.rollback();
    throw new Error(`Invalid product_id: ${invalidProduct.product_id}`);
  }

  // Item details
  const itemDetails = await models.ProductItemDetail.findAll({
    where: { id: { [Op.in]: itemDetailIds }, deleted_at: null },
    attributes: ["id", "product_id"],
    raw: true,
    transaction,
  });

  const itemDetailMap = Object.fromEntries(
    itemDetails.map(d => [d.id, d.product_id])
  );

  const invalidDetail = items.find(
    i => !itemDetailMap[i.product_item_detail_id ]
  );

  if (invalidDetail) {
    await transaction.rollback();
    throw new Error(
      `Invalid product_item_detail_id : ${invalidDetail.product_item_detail_id }`
    );
  }

  const mismatch = items.find(
    i => itemDetailMap[i.product_item_detail_id ] !== i.product_id
  );

  if (mismatch) {
    await transaction.rollback();
    throw new Error(
      `Product item detail ID ${mismatch.product_item_detail_id } does not belong to product_id ${mismatch.product_id}`
    );
  }
};

//ITEM STRUCTURE VALIDATION
const validateItemsPayload = async (items, transaction) => {
  if (!items.length) {
    throw new Error("At least one item is required");
  }

  const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  const itemDetailIds = [...new Set(items.map(i => i.product_item_detail_id).filter(Boolean))];

  if (!productIds.length || !itemDetailIds.length) {
    throw new Error("product_id and product_item_detail_id are required in items");
  }

  return { productIds, itemDetailIds };
};

// Create Stock Transfer with items
const createStockTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items = [], remarks, created_by, ...transferData } = req.body;
    const { transfer_no, branch_from, branch_to } = transferData;

    await validateRequiredFields(req);
    await validateUniqueTransferNo(transfer_no, transaction);
    await validateBranches(branch_from, branch_to, transaction);
    const { productIds, itemDetailIds } = await validateItemsPayload(items);
    await validateProductsAndItemDetails(items, productIds, itemDetailIds, transaction);

    // Group by product
    const grouped = {};
    for (const i of items) (grouped[i.product_id] ||= []).push(i);

    const stockTransfer = await models.StockTransfer.create(
      { ...transferData, created_by, remarks, status_id: 1 },
      { transaction }
    );

    // sourceItemId → destination ids
    const transferMap = {};

    for (const productId of Object.keys(grouped)) {
      const rows = grouped[productId];

      const sourceProduct = await models.Product.findByPk(productId, { transaction });
      const additionals = await models.ProductAdditionalDetail.findAll({ where: { product_id: productId }, transaction });
      const variants = await models.ProductVariant.findAll({ where: { product_id: productId }, transaction });

      let destinationProduct = null;
      const newItemPayloads = [];

      for (const row of rows) {
        const { product_item_detail_id, transfer_quantity } = row;

        const sourceItem = await models.ProductItemDetail.findOne({
          where: {
            id: product_item_detail_id,
            product_id: productId,
            quantity: { [Op.gte]: transfer_quantity }
          },
          transaction
        });

        if (!sourceItem) throw new Error("Insufficient stock for item " + product_item_detail_id);

        await sourceItem.update(
          { quantity: Number(sourceItem.quantity) - Number(transfer_quantity) },
          { transaction }
        );

        // Find existing transferred SKU
        const existingItem = await models.ProductItemDetail.findOne({
          where: { sku_id: sourceItem.sku_id, is_stock_transferred: true },
          transaction
        });

        let existingProduct = null;
        if (existingItem) {
          existingProduct = await models.Product.findOne({
            where: { id: existingItem.product_id, branch_id: branch_to },
            transaction
          });
        }

        if (existingProduct) {
          await existingItem.update(
            { quantity: Number(existingItem.quantity) + Number(transfer_quantity) },
            { transaction }
          );

          destinationProduct = existingProduct;
          transferMap[sourceItem.id] = {
            product_id: existingProduct.id,
            item_id: existingItem.id
          };
        } else {
            newItemPayloads.push({
              _source_item_id: sourceItem.id,
              sku_id: sourceItem.sku_id,
              variation: sourceItem.variation,
              quantity: transfer_quantity,
              net_weight: sourceItem.net_weight,
              gross_weight: sourceItem.gross_weight,
              actual_stone_weight: sourceItem.actual_stone_weight,
              stone_weight: sourceItem.stone_weight,
              stone_value: sourceItem.stone_value,
              rate_per_gram: sourceItem.rate_per_gram,
              base_price: sourceItem.base_price,
              item_price: sourceItem.item_price,
              making_charge_type: sourceItem.making_charge_type,
              making_charge: sourceItem.making_charge,
              wastage_type: sourceItem.wastage_type,
              wastage: sourceItem.wastage,
              is_visible: sourceItem.is_visible,
              website_price_type: sourceItem.website_price_type,
              website_price: sourceItem.website_price,
              measurement_details: sourceItem.measurement_details,
              is_stock_transferred: true,

            additional_details: additionals
              .filter(a => a.item_detail_id === sourceItem.id)
              .map(a => ({
                ...a.get({ plain: true }),
                id: undefined,
                product_id: undefined,
                item_detail_id: undefined
              }))
          });
        }
      }

      // Create destination product if needed
      if (newItemPayloads.length) {
        const newProduct = await ProductService.createProductInternal({
          product_name: sourceProduct.product_name,
          product_code: sourceProduct.product_code,
          description: sourceProduct.description,
          vendor_id: sourceProduct.vendor_id,
          material_type_id: sourceProduct.material_type_id,
          category_id: sourceProduct.category_id,
          subcategory_id: sourceProduct.subcategory_id,
          grn_id: sourceProduct.grn_id,
          hsn_code: sourceProduct.hsn_code,
          purity: sourceProduct.purity,
          product_type: sourceProduct.product_type,
          variation_type: sourceProduct.variation_type,
          sku_id: sourceProduct.sku_id,
          product_variations: sourceProduct.product_variations,
          ref_no_id: sourceProduct.ref_no_id,
          image_urls: sourceProduct.image_urls,
          qr_image_url: sourceProduct.qr_image_url,
          is_published: sourceProduct.is_published,
          branch_id: branch_to,
          item_details: newItemPayloads
        }, transaction);

        destinationProduct = newProduct;

        const newItems = await models.ProductItemDetail.findAll({
          where: { product_id: newProduct.id },
          order: [["id", "ASC"]],
          transaction
        });

        for (let i = 0; i < newItems.length; i++) {
          const srcId = newItemPayloads[i]._source_item_id;
          transferMap[srcId] = {
            product_id: newProduct.id,
            item_id: newItems[i].id
          };
        }

        if (variants.length) {
          await models.ProductVariant.bulkCreate(
            variants.map(v => ({
              product_id: newProduct.id,
              variant_id: v.variant_id,
              variant_type_ids: v.variant_type_ids
            })),
            { transaction }
          );
        }

        await ProductService.cloneProductAddOns(productId, newProduct.id, transaction);
      }
    }

    // Save transfer items
    await models.StockTransferItem.bulkCreate(
      items.map(i => ({
        ...i,
        stock_transfer_id: stockTransfer.id,
        transferred_product_id: transferMap[i.product_item_detail_id].product_id,
        transferred_product_item_id: transferMap[i.product_item_detail_id].item_id
      })),
      { transaction }
    );

    await models.StockTransferStatusHistory.create(
      { stock_transfer_id: stockTransfer.id, status_id: 1, updated_by: created_by, remarks: "Stock Transfer Created" },
      { transaction }
    );

    await transaction.commit();
    return commonService.createdResponse(res, await getStockTransferWithItems(stockTransfer.id));
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    return commonService.badRequest(res, err.message);
  }
};

// Get Stock Transfer by ID with items
const getStockTransferById = async (req, res) => {
  try {
    const { id } = req.params;
    const stockTransfer = await getStockTransferWithItems(id);

    if (!stockTransfer) {
      return commonService.notFound(res, "Stock Transfer not found");
    }

    return commonService.okResponse(res, stockTransfer);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

const getStockTransferWithItems = async (stockTransferId) => {
  try {
    // Get Stock Transfer details
    const stockTransfer = await models.StockTransfer.findByPk(stockTransferId, {
      raw: true,
      nest: true,
    });

    if (!stockTransfer) return null;

    // Get Stock Transfer items with related data using raw queries
     const items = await sequelize.query(
      `
      SELECT
        sti.*,
        mt.material_type as material_type_name,
        c.category_name as category_name,
        sc.subcategory_name as subcategory_name
      FROM "stock_transfer_items" sti
      LEFT JOIN "materialTypes" mt ON sti.material_type_id = mt.id
      LEFT JOIN categories c ON sti.category_id = c.id
      LEFT JOIN subcategories sc ON sti.subcategory_id = sc.id
      WHERE sti.stock_transfer_id = :stockTransferId
      ORDER BY sti.id ASC
    `,
      {
        replacements: { stockTransferId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // TRACKING TIMELINE
    const tracking = await models.StockTransferTracking.findAll({
      where: {
        stock_transfer_id: stockTransferId,
        deleted_at: null,
      },
      order: [["created_at", "ASC"]],
      raw: true,
    })

    // Get branch details
    const [branchFrom, branchTo] = await Promise.all([
      models.Branch.findByPk(stockTransfer.branch_from, {
        attributes: ["id", "branch_name"],
        raw: true,
      }),
      models.Branch.findByPk(stockTransfer.branch_to, {
        attributes: ["id", "branch_name"],
        raw: true,
      })
    ]);

    return {
      ...stockTransfer,
      branch_from_detail: branchFrom || { id: stockTransfer.branch_from, branch_name: "Branch Not Found" },
      branch_to_detail: branchTo || { id: stockTransfer.branch_to, branch_name: "Branch Not Found" },
      items,
      tracking_timeline: tracking,
    };
  } catch (error) {
    console.error("Error in getStockTransferWithItems:", error);
    throw error;
  }
};

// Update Stock Transfer and its items
const updateStockTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { items = [], ...updateData } = req.body;

    // Find existing Stock Transfer
    const stockTransfer = await models.StockTransfer.findByPk(id, { transaction });
    if (!stockTransfer) {
      await transaction.rollback();
      return commonService.notFound(res, "Stock Transfer not found");
    }

    // Update Stock Transfer header fields
    await stockTransfer.update(updateData, { transaction });

    // HARD DELETE old items
    await models.StockTransferItem.destroy({
      where: { stock_transfer_id: id },
      force: true,
      transaction,
    });

    // Insert new items
    const newItems = items.map((item) => ({
      ...item,
      stock_transfer_id: id,
    }));

    if (newItems.length > 0) {
      await models.StockTransferItem.bulkCreate(newItems, { transaction });
    }

    await transaction.commit();
    const result = await getStockTransferWithItems(id);
    return commonService.okResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Delete Stock Transfer (soft delete)
const deleteStockTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const stockTransfer = await models.StockTransfer.findByPk(id, { transaction });

    if (!stockTransfer) {
      await transaction.rollback();
      return commonService.notFound(res, "Stock Transfer not found");
    }

    // Soft delete Stock Transfer and its items
    await Promise.all([
      stockTransfer.destroy({ transaction }),
      models.StockTransferItem.destroy({
        where: { stock_transfer_id: id },
        transaction,
      }),
    ]);

    await transaction.commit();
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// List all Stock Transfers with pagination and search
const listStockTransfers = async (req, res) => {
  try {
    const {
      page,
      limit,
      search = "",
      status_id,
      branch_from,
      branch_to,
      from_date,
      to_date,
    } = req.query;

    // GLOBAL COUNTS (UNFILTERED)
    const baseWhere = { deleted_at: null };

    const [newCount, inProgressCount, deliveredCount] = await Promise.all([
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 1 } }),
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 2 } }),
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 3 } }),
    ]);

    // FILTERED WHERE
    const where = { deleted_at: null };

    if (status_id) where.status_id = status_id;
    if (branch_from) where.branch_from = branch_from;
    if (branch_to) where.branch_to = branch_to;

    // Date logic
    if (from_date && to_date) {
      where.date = { [Op.between]: [from_date, to_date] };
    } else if (from_date) {
      where.date = from_date;
    } else if (to_date) {
      where.date = to_date;
    }

    // Search
    if (search) {
      where[Op.or] = [
        { transfer_no: { [Op.iLike]: `%${search}%` } },
        { reference_no: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // QUERY OPTIONS
    const queryOptions = {
      where,
      order: [["created_at", "DESC"]],
    };

    const isPaginated = page || limit;

    if (isPaginated) {
      queryOptions.limit = parseInt(limit || 10);
      queryOptions.offset = (parseInt(page || 1) - 1) * queryOptions.limit;
    }

    // FETCH DATA
    const { rows, count } = isPaginated
      ? await models.StockTransfer.findAndCountAll(queryOptions)
      : { rows: await models.StockTransfer.findAll(queryOptions), count: null };

    // BRANCH NAMES
    const transfers = await Promise.all(
      rows.map(async (t) => {
        const [fromBranch, toBranch] = await Promise.all([
          models.Branch.findByPk(t.branch_from, {
            attributes: ["branch_name"],
            raw: true,
          }),
          models.Branch.findByPk(t.branch_to, {
            attributes: ["branch_name"],
            raw: true,
          }),
        ]);

        return {
          ...t.get({ plain: true }),
          branch_from_name: fromBranch?.branch_name || null,
          branch_to_name: toBranch?.branch_name || null,
        };
      })
    );

    return commonService.okResponse(res, {
      summary: {
        new: newCount,
        in_progress: inProgressCount,
        delivered: deliveredCount,
      },
      total: isPaginated ? count : transfers.length,
      page: isPaginated ? parseInt(page || 1) : null,
      limit: isPaginated ? parseInt(limit || 10) : null,
      data: transfers,
    });

  } catch (error) {
    console.error("Stock transfer list error:", error);
    return commonService.handleError(res, error);
  }
};


const updateStockTransferStatus = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      status_id,

      // Dispatch
      total_packages,
      total_weight,
      dispatch_date,
      transporter_name,
      vehicle_no,
      tracking_number,
      attach_bill_url,
      tracking_remarks,

      // Delivery
      delivered_date,
      received_by,
      received_weight,
      received_packages,
      delivery_remarks,
    } = req.body;

    if (!status_id) {
      throw new Error("status_id is required");
    }
    
    // FETCH STOCK TRANSFER  
    const stockTransfer = await models.StockTransfer.findOne({
      where: {
        id,
        deleted_at: null,
      },
      transaction,
    });

    if (!stockTransfer) {
      throw new Error("Stock Transfer not found");
    }
    
    // STATUS VALIDATION   
    if (stockTransfer.status_id === 3) {
      throw new Error("Delivered stock transfer cannot be updated");
    }

    if (status_id !== stockTransfer.status_id + 1) {
      throw new Error("Invalid status transition");
    }

    if (status_id === 2 && !dispatch_date) {
      throw new Error("Dispatch date is required");
    }

    if (status_id === 3 && !delivered_date) {
      throw new Error("Delivered date is required");
    }
   
    // UPDATE STOCK TRANSFER STATUS    
    await stockTransfer.update(
      { status_id },
      { transaction }
    );
    
    // PREPARE TRACKING DATA (SAFE)    
    const trackingData = {};

    if (status_id === 2) {
      // DISPATCH DATA ONLY
      Object.assign(trackingData, {
        total_packages,
        total_weight,
        dispatch_date,
        transporter_name,
        vehicle_no,
        tracking_number,
        attach_bill_url,
        tracking_remarks,
      });
    }

    if (status_id === 3) {
      // DELIVERY DATA ONLY
      Object.assign(trackingData, {
        delivered_date,
        received_by,
        received_weight,
        received_packages,
        delivery_remarks,
      });
    }
    
    // UPSERT TRACKING RECORD    
    const existingTracking = await models.StockTransferTracking.findOne({
      where: { stock_transfer_id: id },
      transaction,
    });

    if (existingTracking) {
      // UPDATE EXISTING ROW
      await existingTracking.update(trackingData, { transaction });
    } else {
      // CREATE FIRST ROW (DISPATCH ONLY)
      await models.StockTransferTracking.create(
        {
          stock_transfer_id: id,
          ...trackingData,
        },
        { transaction }
      );
    }

    await transaction.commit();

    return commonService.okResponse(res, {
      message: "Stock transfer status updated successfully",
    });

  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error("Update Stock Transfer Status Error =>", error);
    return commonService.badRequest(res, error.message);
  }
};


const searchProductBySku = async (req, res) => {
  try {
    const { sku, product_name, branch_id } = req.query;

    const [categories, subcategories, materialTypes] = await Promise.all([
      models.Category.findAll({ raw: true }),
      models.Subcategory.findAll({ raw: true }),
      models.MaterialType.findAll({ raw: true }),
    ]);

    const categoryMap = new Map(categories.map(c => [c.id, c.category_name]));
    const subcategoryMap = new Map(subcategories.map(sc => [sc.id, sc.subcategory_name]));
    const materialTypeMap = new Map(materialTypes.map(m => [m.id, m.material_type]));

    // Helper: convert product + item → flat response object
    const formatItem = async (product, item) => {
      const priceDetails = await ProductService.calculateSellingPrice(product, item, models);

      return {
        sku_id: item.sku_id || product.sku_id,
        product_name: product.product_name,
        product_description: product.description,
        product_type: product.product_type,
        branch_id: product.branch_id,
        category_id: product.category_id,
        category_name: categoryMap.get(product.category_id) || null,
        subcategory_id: product.subcategory_id,
        subcategory_name: subcategoryMap.get(product.subcategory_id) || null,
        material_type_id: product.material_type_id,
        material_type: materialTypeMap.get(product.material_type_id) || null,
        variation_type: product.variation_type,
        product_variations: product.product_variations,
        purity: product.purity,
        product_id: product.id,
        product_item_details_id: item.id,
        quantity: item.quantity,
        hsn_code: product.hsn_code,
        base_price: item.base_price,
        gross_weight: item.gross_weight,
        net_weight: item.net_weight,
        product_item_wastage: item.wastage,
        ...priceDetails,
      };
    };

    // Build product search condition
    const productWhere = {};

    if (sku && sku.trim() !== "") {
      productWhere.sku_id = sku.trim();
    }

    if (product_name && product_name.trim() !== "") {
      productWhere.product_name = {
        [Op.iLike]: `%${product_name.trim()}%`,
      };
    }

    if (branch_id && branch_id.trim() !== "") {
      productWhere.branch_id = Number(branch_id.trim());
    }

    // CASE 1 → No filters → get all in-stock items
    if (Object.keys(productWhere).length === 0) {
      const [allProducts, allItems] = await Promise.all([
        models.Product.findAll({ raw: true }),
        models.ProductItemDetail.findAll({
          where: {
            quantity: { [Op.gt]: 0 },
            is_visible: true,
          },
          raw: true,
        }),
      ]);

      const output = await Promise.all(
        allItems.map(async (item) => {
          const product = allProducts.find((p) => p.id === item.product_id);
          return product ? formatItem(product, item) : null;
        })
      );

      return commonService.okResponse(res, output.filter(Boolean));
    }

    // Fetch matching products
    const products = await models.Product.findAll({
      where: productWhere,
      raw: true,
    });

    let items = [];

    if (products.length > 0) {
      const productIds = products.map((p) => p.id);

      items = await models.ProductItemDetail.findAll({
        where: {
          product_id: { [Op.in]: productIds },
          ...(sku ? { sku_id: sku.trim() } : {}),
          quantity: { [Op.gt]: 0 },
          is_visible: true,
        },
        raw: true,
      });
    }

    // Item SKU only (fallback)
    if (items.length === 0 && sku) {
      const itemDetail = await models.ProductItemDetail.findOne({
        where: {
          sku_id: sku.trim(),
          quantity: { [Op.gt]: 0 },
          is_visible: true,
        },
        raw: true,
      });

      if (itemDetail) {
        const product = await models.Product.findOne({
          where: { id: itemDetail.product_id },
          raw: true,
        });

        const response = await formatItem(product, itemDetail);
        return commonService.okResponse(res, [response]);
      }
    }

    if (items.length === 0) {
      return commonService.notFound(
        res,
        "No in-stock product found for given search criteria"
      );
    }

    // Flatten response
    const flatResponse = await Promise.all(
      items.map(async (item) => {
        const product = products.find((p) => p.id === item.product_id);
        return product ? formatItem(product, item) : null;
      })
    );

    return commonService.okResponse(res, flatResponse.filter(Boolean));
  } catch (error) {
    console.error("Error searching products:", error);
    return commonService.handleError(res, error);
  }
};
module.exports = {
  generateStockCode,
  createStockTransfer,
  getStockTransferById,
  updateStockTransfer,
  deleteStockTransfer,
  listStockTransfers,
  validateRequiredFields,
  validateUniqueTransferNo,
  validateBranches,
  validateItemsPayload,
  validateProductsAndItemDetails,
  updateStockTransferStatus,
  searchProductBySku
};
