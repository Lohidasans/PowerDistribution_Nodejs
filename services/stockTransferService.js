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
  console.log('[validateRequiredFields] Starting validation');
  console.log('[validateRequiredFields] Request body:', JSON.stringify(req.body, null, 2));
  
  const requiredFields = [
    "transfer_no",
    "date",
    "branch_from",
    "branch_to",
    "created_by",
  ];

  for (const field of requiredFields) {
    if (!req.body[field]) {
      console.log(`[validateRequiredFields] Missing field: ${field}`);
      throw new Error(`${field} is required`);
    }
  }
  
  console.log('[validateRequiredFields] All required fields present');
};

//UNIQUE TRANSFER NO
const validateUniqueTransferNo = async (transfer_no, transaction) => {
  console.log('[validateUniqueTransferNo] Checking transfer_no:', transfer_no);
  
  const existing = await models.StockTransfer.findOne({
    where: { transfer_no, deleted_at: null },
    transaction,
  });

  if (existing) {
    console.log('[validateUniqueTransferNo] Duplicate found:', existing.id);
    throw new Error("Stock Transfer code already exists");
  }
  
  console.log('[validateUniqueTransferNo] Transfer number is unique');
};

//BRANCH VALIDATION
const validateBranches = async (branch_from, branch_to, transaction) => {
  console.log('[validateBranches] Validating branches - from:', branch_from, 'to:', branch_to);
  
  if (branch_from === branch_to) {
    console.log('[validateBranches] Same branch error');
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

  console.log('[validateBranches] Found branches:', branches.map(b => b.id));
  const ids = branches.map(b => b.id);

  if (!ids.includes(branch_from)) {
    console.log('[validateBranches] Invalid branch_from:', branch_from);
    throw new Error("Invalid branch_from Id");
  }

  if (!ids.includes(branch_to)) {
    console.log('[validateBranches] Invalid branch_to:', branch_to);
    throw new Error("Invalid branch_to Id");
  }
  
  console.log('[validateBranches] Branch validation successful');
};

// PRODUCT & ITEM DETAIL VALIDATION
const validateProductsAndItemDetails = async (
  items,
  productIds,
  itemDetailIds,
  transaction
) => {
  console.log('[validateProductsAndItemDetails] Validating products:', productIds);
  console.log('[validateProductsAndItemDetails] Validating item details:', itemDetailIds);
  
  // Products
  const products = await models.Product.findAll({
    where: { id: { [Op.in]: productIds }, deleted_at: null },
    attributes: ["id"],
    raw: true,
    transaction,
  });

  console.log('[validateProductsAndItemDetails] Found products:', products.map(p => p.id));
  const validProductIds = products.map(p => p.id);
  const invalidProduct = items.find(i => !validProductIds.includes(i.product_id));

  if (invalidProduct) {
    console.log('[validateProductsAndItemDetails] Invalid product found:', invalidProduct.product_id);
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

  console.log('[validateProductsAndItemDetails] Found item details:', itemDetails.length);
  const itemDetailMap = Object.fromEntries(
    itemDetails.map(d => [d.id, d.product_id])
  );

  const invalidDetail = items.find(
    i => !itemDetailMap[i.product_item_detail_id ]
  );

  if (invalidDetail) {
    console.log('[validateProductsAndItemDetails] Invalid item detail:', invalidDetail.product_item_detail_id);
    await transaction.rollback();
    throw new Error(
      `Invalid product_item_detail_id : ${invalidDetail.product_item_detail_id }`
    );
  }

  const mismatch = items.find(
    i => itemDetailMap[i.product_item_detail_id ] !== i.product_id
  );

  if (mismatch) {
    console.log('[validateProductsAndItemDetails] Product-item mismatch:', mismatch);
    await transaction.rollback();
    throw new Error(
      `Product item detail ID ${mismatch.product_item_detail_id } does not belong to product_id ${mismatch.product_id}`
    );
  }
  
  console.log('[validateProductsAndItemDetails] All products and items validated successfully');
};

//ITEM STRUCTURE VALIDATION
const validateItemsPayload = async (items, transaction) => {
  console.log('[validateItemsPayload] Validating items count:', items.length);
  
  if (!items.length) {
    console.log('[validateItemsPayload] No items provided');
    throw new Error("At least one item is required");
  }

  const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  const itemDetailIds = [...new Set(items.map(i => i.product_item_detail_id).filter(Boolean))];

  console.log('[validateItemsPayload] Unique product IDs:', productIds);
  console.log('[validateItemsPayload] Unique item detail IDs:', itemDetailIds);
  
  if (!productIds.length || !itemDetailIds.length) {
    console.log('[validateItemsPayload] Missing product_id or item_detail_id');
    throw new Error("product_id and product_item_detail_id are required in items");
  }

  return { productIds, itemDetailIds };
};

// Create Stock Transfer with items
const createStockTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    console.log('========== CREATE STOCK TRANSFER START ==========');
    const { items = [], remarks, created_by, ...transferData } = req.body;
    const { transfer_no, branch_from, branch_to } = transferData;

    console.log('[createStockTransfer] Transfer data:', { transfer_no, branch_from, branch_to, items_count: items.length });
    
    await validateRequiredFields(req);
    await validateUniqueTransferNo(transfer_no, transaction);
    await validateBranches(branch_from, branch_to, transaction);
    const { productIds, itemDetailIds } = await validateItemsPayload(items);
    await validateProductsAndItemDetails(items, productIds, itemDetailIds, transaction);
    
    console.log('[createStockTransfer] All validations passed');

    // Group by product
    const grouped = {};
    for (const i of items) (grouped[i.product_id] ||= []).push(i);
    console.log('[createStockTransfer] Grouped items by product:', Object.keys(grouped));

    const stockTransfer = await models.StockTransfer.create(
      { ...transferData, created_by, remarks, status_id: 1 },
      { transaction }
    );
    console.log('[createStockTransfer] Stock transfer created with ID:', stockTransfer.id);

    // sourceItemId → destination ids
    const transferMap = {};

    for (const productId of Object.keys(grouped)) {
      const rows = grouped[productId];
      console.log(`[createStockTransfer] Processing product ID: ${productId} with ${rows.length} items`);

      const sourceProduct = await models.Product.findByPk(productId, { transaction });
      if (!sourceProduct || Number(sourceProduct.branch_id) !== Number(branch_from)) {
        throw new Error(`Product ${productId} does not belong to the source branch`);
      }
      console.log(`[createStockTransfer] Source product found:`, sourceProduct.product_name);
      
      const additionals = await models.ProductAdditionalDetail.findAll({ where: { product_id: productId }, transaction });
      const variants = await models.ProductVariant.findAll({ where: { product_id: productId }, transaction });
      console.log(`[createStockTransfer] Found ${additionals.length} additionals, ${variants.length} variants`);

      let destinationProduct = null;
      const newItemPayloads = [];

      for (const row of rows) {
        const { product_item_detail_id, transfer_quantity } = row;
        console.log(`[createStockTransfer] Processing item ${product_item_detail_id}, qty: ${transfer_quantity}`);

        const sourceItem = await models.ProductItemDetail.findOne({
          where: {
            id: product_item_detail_id,
            product_id: productId,
            quantity: { [Op.gte]: transfer_quantity }
          },
          transaction
        });

        if (!sourceItem) {
          console.log(`[createStockTransfer] Insufficient stock for item ${product_item_detail_id}`);
          throw new Error("Insufficient stock for item " + product_item_detail_id);
        }
        console.log(`[createStockTransfer] Source item current qty: ${sourceItem.quantity}`);

        const newQty = Number(sourceItem.quantity) - Number(transfer_quantity);
        console.log(`[createStockTransfer] Updating source item qty from ${sourceItem.quantity} to ${newQty}`);
        
        await sourceItem.update(
          {
            quantity: newQty,
            stock_out_reason: newQty === 0 ? "TRANSFERRED" : null
          },
          { transaction }
        );

        // Find existing transferred product in destination branch
        // Match by sku_id + grn_id + branch to identify if this product was already transferred
        let existingProduct = null;
        if (sourceProduct.sku_id && sourceProduct.grn_id) {
          existingProduct = await models.Product.findOne({
            where: { 
              sku_id: sourceProduct.sku_id,
              grn_id: sourceProduct.grn_id,
              branch_id: branch_to,
              deleted_at: null
            },
            transaction
          });
          console.log(`[createStockTransfer] Existing product in destination branch:`, !!existingProduct);
          if (existingProduct) {
            console.log(`[createStockTransfer] Found existing product ID: ${existingProduct.id}, SKU: ${existingProduct.sku_id}`);
          }
        } else {
          console.log(`[createStockTransfer] Source product missing sku_id or grn_id - will create new product`);
        }

        let existingItem = null;
        if (existingProduct) {
          // Find existing item with same SKU in the existing product
          existingItem = await models.ProductItemDetail.findOne({
            where: { 
              product_id: existingProduct.id,
              sku_id: sourceItem.sku_id,
              deleted_at: null
            },
            transaction
          });
          console.log(`[createStockTransfer] Existing item in product:`, !!existingItem);
          if (existingItem) {
            console.log(`[createStockTransfer] Found existing item ID: ${existingItem.id}, SKU: ${existingItem.sku_id}`);
          }
        }

        if (existingProduct && existingItem) {
          console.log(`[createStockTransfer] Updating existing item qty from ${existingItem.quantity} to ${Number(existingItem.quantity) + Number(transfer_quantity)}`);
          
          await existingItem.update(
            { quantity: Number(existingItem.quantity) + Number(transfer_quantity) },
            { transaction }
          );

          destinationProduct = existingProduct;
          transferMap[sourceItem.id] = {
            product_id: existingProduct.id,
            item_id: existingItem.id
          };
        } else if (existingProduct && !existingItem) {
          console.log(`[createStockTransfer] Product exists but item doesn't - adding new item to existing product`);
          // Product exists but this specific item doesn't - add item to existing product
          newItemPayloads.push({
            _source_item_id: sourceItem.id,
            _existing_product_id: existingProduct.id,
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
          destinationProduct = existingProduct;
        } else {
          console.log(`[createStockTransfer] Creating new item payload for destination`);
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

      // Separate items for existing product vs new product
      const itemsForExistingProduct = newItemPayloads.filter(p => p._existing_product_id);
      const itemsForNewProduct = newItemPayloads.filter(p => !p._existing_product_id);

      // Add items to existing product
      if (itemsForExistingProduct.length) {
        const existingProdId = itemsForExistingProduct[0]._existing_product_id;
        console.log(`[createStockTransfer] Adding ${itemsForExistingProduct.length} items to existing product ${existingProdId}`);
        
        for (const itemPayload of itemsForExistingProduct) {
          const { _source_item_id, _existing_product_id, additional_details, ...itemData } = itemPayload;
          
          const createdItem = await models.ProductItemDetail.create({
            ...itemData,
            product_id: existingProdId,
            initial_quantity: itemData.quantity
          }, { transaction });
          
          console.log(`[createStockTransfer] Created item ${createdItem.id} in existing product`);
          
          transferMap[_source_item_id] = {
            product_id: existingProdId,
            item_id: createdItem.id
          };

          // Add additional details if any
          if (additional_details && additional_details.length) {
            await models.ProductAdditionalDetail.bulkCreate(
              additional_details.map(ad => ({
                ...ad,
                product_id: existingProdId,
                item_detail_id: createdItem.id
              })),
              { transaction }
            );
          }
        }
        destinationProduct = await models.Product.findByPk(existingProdId, { transaction });
      }

      // Create new product if needed
      if (itemsForNewProduct.length) {
        console.log(`[createStockTransfer] Creating new product with ${itemsForNewProduct.length} items`);
        
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
          item_details: itemsForNewProduct
        }, transaction);
        console.log(`[createStockTransfer] New product created with ID: ${newProduct.id}`);

        destinationProduct = newProduct;

        const newItems = await models.ProductItemDetail.findAll({
          where: { product_id: newProduct.id },
          order: [["id", "ASC"]],
          transaction
        });
        console.log(`[createStockTransfer] Retrieved ${newItems.length} new items for mapping`);

        for (let i = 0; i < newItems.length; i++) {
          const srcId = itemsForNewProduct[i]._source_item_id;
          transferMap[srcId] = {
            product_id: newProduct.id,
            item_id: newItems[i].id
          };
          console.log(`[createStockTransfer] Mapped source item ${srcId} to new item ${newItems[i].id}`);
        }

        if (variants.length) {
          console.log(`[createStockTransfer] Creating ${variants.length} variants for new product`);
          
          await models.ProductVariant.bulkCreate(
            variants.map(v => ({
              product_id: newProduct.id,
              variant_id: v.variant_id,
              variant_type_ids: v.variant_type_ids
            })),
            { transaction }
          );
        }

        console.log(`[createStockTransfer] Cloning product add-ons`);
        await ProductService.cloneProductAddOns(productId, newProduct.id, transaction);
      }
    }

    // Save transfer items
    console.log(`[createStockTransfer] Creating ${items.length} stock transfer items`);
    
    await models.StockTransferItem.bulkCreate(
      items.map(i => ({
        ...i,
        stock_transfer_id: stockTransfer.id,
        transferred_product_id: transferMap[i.product_item_detail_id].product_id,
        transferred_product_item_id: transferMap[i.product_item_detail_id].item_id
      })),
      { transaction }
    );
    console.log(`[createStockTransfer] Stock transfer items created`);

    await models.StockTransferStatusHistory.create(
      { stock_transfer_id: stockTransfer.id, status_id: 1, updated_by: created_by, remarks: "Stock Transfer Created" },
      { transaction }
    );
    console.log(`[createStockTransfer] Status history created`);

    await transaction.commit();
    console.log(`[createStockTransfer] Transaction committed successfully`);
    console.log('========== CREATE STOCK TRANSFER END ==========');
    
    return commonService.createdResponse(res, await getStockTransferWithItems(stockTransfer.id));
  } catch (err) {
    console.error('[createStockTransfer] ERROR:', err.message);
    console.error('[createStockTransfer] Stack:', err.stack);
    
    if (!transaction.finished) await transaction.rollback();
    console.log('[createStockTransfer] Transaction rolled back');
    console.log('========== CREATE STOCK TRANSFER FAILED ==========');
    
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
        attributes: ["id", "branch_name",'address', 'mobile'],
        raw: true,
      }),
      models.Branch.findByPk(stockTransfer.branch_to, {
        attributes: ["id", "branch_name",'address', 'mobile'],
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

    const transferId = req.params.id;
    const { items = [], remarks, created_by, ...transferData } = req.body;
    const { branch_from, branch_to } = transferData;

    console.log("========== UPDATE STOCK TRANSFER START ==========");

    const stockTransfer = await models.StockTransfer.findByPk(transferId, {
      transaction
    });

    if (!stockTransfer) {
      throw new Error("Stock transfer not found");
    }

    if (stockTransfer.status_id !== 1) {
      throw new Error("Only NEW transfers can be updated");
    }

    // STEP 1: RESTORE OLD STOCK
    const oldItems = await models.StockTransferItem.findAll({
      where: { stock_transfer_id: transferId },
      transaction
    });

    for (const item of oldItems) {

      const sourceItem = await models.ProductItemDetail.findByPk(
        item.product_item_detail_id,
        { transaction }
      );

      const destinationItem = await models.ProductItemDetail.findByPk(
        item.transferred_product_item_id,
        { transaction }
      );

      if (sourceItem) {
        const restoredQty =
          Number(sourceItem.quantity) + Number(item.transfer_quantity);

        await sourceItem.update({
          quantity: restoredQty,
          stock_out_reason: restoredQty === 0 ? "TRANSFERRED" : null
        }, { transaction });
      }

      if (destinationItem) {
        await destinationItem.update(
          {
            quantity:
              Number(destinationItem.quantity) -
              Number(item.transfer_quantity)
          },
          { transaction }
        );
      }
    }

    // STEP 2: DELETE OLD TRANSFER ITEMS
    await models.StockTransferItem.destroy({
      where: { stock_transfer_id: transferId },
      transaction
    });

    // STEP 3: VALIDATION
    await validateRequiredFields(req);
    await validateBranches(branch_from, branch_to, transaction);

    const { productIds, itemDetailIds } =
      await validateItemsPayload(items);

    await validateProductsAndItemDetails(
      items,
      productIds,
      itemDetailIds,
      transaction
    );

    // STEP 4: UPDATE HEADER
    await stockTransfer.update(
      {
        ...transferData,
        remarks,
        created_by
      },
      { transaction }
    );

    // STEP 5: APPLY NEW TRANSFER
    const transferMap = {};

    const grouped = {};
    for (const i of items) {
      (grouped[i.product_id] ||= []).push(i);
    }

    for (const productId of Object.keys(grouped)) {

      const rows = grouped[productId];

      const sourceProduct = await models.Product.findByPk(productId, {
        transaction
      });

      const additionals = await models.ProductAdditionalDetail.findAll({
        where: { product_id: productId },
        transaction
      });

      const variants = await models.ProductVariant.findAll({
        where: { product_id: productId },
        transaction
      });

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

        if (!sourceItem) {
          throw new Error(
            "Insufficient stock for item " + product_item_detail_id
          );
        }

        // Reduce source stock
        const newQty = Number(sourceItem.quantity) - Number(transfer_quantity);

        await sourceItem.update({
          quantity: newQty,
          stock_out_reason: newQty === 0 ? "TRANSFERRED" : null
        }, { transaction });

        // Find destination product
        let destinationProduct = await models.Product.findOne({
          where: {
            sku_id: sourceProduct.sku_id,
            grn_id: sourceProduct.grn_id,
            branch_id: branch_to,
            deleted_at: null
          },
          transaction
        });

        let destinationItem = null;

        // CASE 1: Product Exists
        if (destinationProduct) {

          destinationItem =
            await models.ProductItemDetail.findOne({
              where: {
                product_id: destinationProduct.id,
                sku_id: sourceItem.sku_id,
                deleted_at: null
              },
              transaction
            });

          if (destinationItem) {

            await destinationItem.update(
              {
                quantity:
                  Number(destinationItem.quantity) +
                  Number(transfer_quantity)
              },
              { transaction }
            );

          } else {

            destinationItem =
              await models.ProductItemDetail.create(
                {
                  product_id: destinationProduct.id,
                  sku_id: sourceItem.sku_id,
                  variation: sourceItem.variation,
                  quantity: transfer_quantity,
                  net_weight: sourceItem.net_weight,
                  gross_weight: sourceItem.gross_weight,
                  actual_stone_weight:
                    sourceItem.actual_stone_weight,
                  stone_weight: sourceItem.stone_weight,
                  stone_value: sourceItem.stone_value,
                  rate_per_gram: sourceItem.rate_per_gram,
                  base_price: sourceItem.base_price,
                  item_price: sourceItem.item_price,
                  making_charge_type:
                    sourceItem.making_charge_type,
                  making_charge: sourceItem.making_charge,
                  wastage_type: sourceItem.wastage_type,
                  wastage: sourceItem.wastage,
                  is_visible: sourceItem.is_visible,
                  website_price_type:
                    sourceItem.website_price_type,
                  website_price: sourceItem.website_price,
                  measurement_details:
                    sourceItem.measurement_details,
                  is_stock_transferred: true
                },
                { transaction }
              );
          }

        } else {

          // CASE 2: Product DOES NOT EXIST clone everything
          const newProduct =
            await ProductService.createProductInternal(
              {
                product_name: sourceProduct.product_name,
                product_code: sourceProduct.product_code,
                description: sourceProduct.description,
                vendor_id: sourceProduct.vendor_id,
                material_type_id:
                  sourceProduct.material_type_id,
                category_id: sourceProduct.category_id,
                subcategory_id:
                  sourceProduct.subcategory_id,
                grn_id: sourceProduct.grn_id,
                hsn_code: sourceProduct.hsn_code,
                purity: sourceProduct.purity,
                product_type: sourceProduct.product_type,
                variation_type:
                  sourceProduct.variation_type,
                sku_id: sourceProduct.sku_id,
                product_variations:
                  sourceProduct.product_variations,
                ref_no_id: sourceProduct.ref_no_id,
                image_urls: sourceProduct.image_urls,
                qr_image_url: sourceProduct.qr_image_url,
                is_published: sourceProduct.is_published,
                branch_id: branch_to,
                item_details: [
                  {
                    sku_id: sourceItem.sku_id,
                    variation: sourceItem.variation,
                    quantity: transfer_quantity,
                    initial_quantity: transfer_quantity,
                    net_weight: sourceItem.net_weight,
                    gross_weight: sourceItem.gross_weight,
                    actual_stone_weight:
                      sourceItem.actual_stone_weight,
                    stone_weight: sourceItem.stone_weight,
                    stone_value: sourceItem.stone_value,
                    rate_per_gram: sourceItem.rate_per_gram,
                    base_price: sourceItem.base_price,
                    item_price: sourceItem.item_price,
                    making_charge_type:
                      sourceItem.making_charge_type,
                    making_charge: sourceItem.making_charge,
                    wastage_type: sourceItem.wastage_type,
                    wastage: sourceItem.wastage,
                    is_visible: sourceItem.is_visible,
                    website_price_type:
                      sourceItem.website_price_type,
                    website_price: sourceItem.website_price,
                    measurement_details:
                      sourceItem.measurement_details,
                    is_stock_transferred: true,
                    additional_details: additionals
                      .filter(
                        a =>
                          a.item_detail_id === sourceItem.id
                      )
                      .map(a => ({
                        ...a.get({ plain: true }),
                        id: undefined,
                        product_id: undefined,
                        item_detail_id: undefined
                      }))
                  }
                ]
              },
              transaction
            );

          destinationProduct = newProduct;

          const createdItem =
            await models.ProductItemDetail.findOne({
              where: { product_id: newProduct.id },
              transaction
            });

          destinationItem = createdItem;

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

          await ProductService.cloneProductAddOns(
            productId,
            newProduct.id,
            transaction
          );
        }

        transferMap[sourceItem.id] = {
          product_id: destinationProduct.id,
          item_id: destinationItem.id
        };
      }
    }

    // STEP 6: INSERT TRANSFER ITEMS
    await models.StockTransferItem.bulkCreate(
      items.map(i => ({
        ...i,
        stock_transfer_id: transferId,
        transferred_product_id:
          transferMap[i.product_item_detail_id].product_id,
        transferred_product_item_id:
          transferMap[i.product_item_detail_id].item_id
      })),
      { transaction }
    );

    await transaction.commit();

    console.log("========== UPDATE STOCK TRANSFER END ==========");

    return commonService.okResponse(res, {
      message: "Stock transfer updated successfully"
    });

  } catch (err) {

    if (!transaction.finished) {
      await transaction.rollback();
    }

    return commonService.badRequest(res, err.message);
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
      branch_id, 
    } = req.query;

    // BASE WHERE WITH BRANCH FILTERS (FOR SUMMARY COUNTS)
    const baseWhere = { deleted_at: null };

    // Branch Admin Filter
    if (branch_id) {
      baseWhere[Op.or] = [
        { branch_from: parseInt(branch_id) },
        { branch_to: parseInt(branch_id) },
      ];
    }

    if (branch_from) baseWhere.branch_from = parseInt(branch_from);
    if (branch_to) baseWhere.branch_to = parseInt(branch_to);

    const [newCount, inProgressCount, deliveredCount] = await Promise.all([
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 1 } }),
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 2 } }),
      models.StockTransfer.count({ where: { ...baseWhere, status_id: 3 } }),
    ]);

    // FILTERED WHERE (INCLUDES ALL FILTERS)
    const where = { ...baseWhere };

    if (status_id) where.status_id = parseInt(status_id);

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
