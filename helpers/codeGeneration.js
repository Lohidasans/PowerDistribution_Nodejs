const { Op } = require("sequelize");
const { models } = require("../models");

// Generate a unique SKU like CJ_CBE_01_0001
// parts: array of strings that form the prefix (e.g., [companyCode, locationCode, branchCode])
const generateUniqueSkuId = async (model, field, parts = []) => {
  const clean = (s) => String(s || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const prefix = parts
    .filter((p) => p !== undefined && p !== null && String(p).trim() !== "")
    .map(clean)
    .join("_");

  const prefixWithSep = prefix ? `${prefix}_` : "";

  // Find last SKU for this prefix
  const lastEntry = await model.findOne({
    where: prefix
      ? { [field]: { [Op.iLike]: `${prefixWithSep}%` } }
      : undefined,
    order: [["id", "DESC"]],
    attributes: [field],
  });

  let nextNumber = 1;
  const lastValue = lastEntry?.[field];
  if (lastValue) {
    const m = String(lastValue).match(/_(\d+)$/);
    if (m) nextNumber = parseInt(m[1], 10) + 1;
  }

  // Build candidate and ensure uniqueness with a short probe loop
  let candidate;
  for (let i = 0; i < 5; i++) {
    candidate = `${prefixWithSep}${String(nextNumber).padStart(4, "0")}`;
    // If prefix is empty, avoid leading underscore
    candidate = candidate.replace(/^_+/, "");

    const exists = await model.count({ where: { [field]: candidate } });
    if (!exists) break;
    nextNumber += 1;
  }

  return candidate;
};

// Generic code generator: e.g., CJ_SLM_001 or ABC-XYZ-0001
const generateUniqueCode = async ( model, field, parts = [],
  { pad = 3, separator = "_" } = {}
) => {
  const clean = (s) => String(s || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const prefix = parts
    .filter((p) => p !== undefined && p !== null && String(p).trim() !== "")
    .map(clean)
    .join(separator);

  const prefixWithSep = prefix ? `${prefix}${separator}` : "";

  const lastEntry = await model.findOne({
    where: prefix ? { [field]: { [Op.iLike]: `${prefixWithSep}%` } } : undefined,
    order: [["id", "DESC"]],
    attributes: [field],
  });

  let nextNumber = 1;
  const lastValue = lastEntry?.[field];
  if (lastValue) {
    const regex = new RegExp(`${separator}(\\d+)$`);
    const m = String(lastValue).match(regex);
    if (m) nextNumber = parseInt(m[1], 10) + 1;
  }

  let candidate;
  for (let i = 0; i < 5; i++) {
    candidate = `${prefixWithSep}${String(nextNumber).padStart(pad, "0")}`
      .replace(new RegExp(`^${separator}+`), "");
    const exists = await model.count({ where: { [field]: candidate } });
    if (!exists) break;
    nextNumber += 1;
  }
  return candidate;
};

//Generate simple running codes
const generateFiscalSeriesCode = async (model, field, prefix, { pad = 3 } = {}) => {
  const cleanPrefix = String(prefix || "").trim().toUpperCase();

  // Escape regex special characters from prefix
  const escapedPrefix = cleanPrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  // Build dynamic regex, extract digits after the prefix
  const regex = new RegExp(`^${escapedPrefix}(\\d+)$`, "i");

  // Fetch all entries with the given prefix
  const entries = await model.findAll({
    where: {
      [field]: { [Op.iLike]: `${cleanPrefix}%` },
    },
    attributes: [field],
    order: [["id", "DESC"]],
    raw: true
  });

  let nextNumber = 1;

  for (const entry of entries) {
    const code = entry[field];

    const match = String(code).match(regex);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
      break;
    }
  }

  return `${cleanPrefix}${String(nextNumber).padStart(pad, "0")}`;
};



const generateProductSKUCode = async (prefixFromQuery = "", options = {}) => {
  const { pad = 3, separator = "_" } = options;

  // 1. Get Company Prefix (CJ, ABC, etc.)
  const superAdmin = await models.SuperAdminProfile.findOne({
    order: [["id", "ASC"]],
    attributes: ["branch_sequence_value"],
    raw: true,
  });

  if (!superAdmin || !superAdmin.branch_sequence_value) {
    throw new Error("Company prefix not configured in Super Admin");
  }

  const companyPrefix = String(superAdmin.branch_sequence_value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  // 2. Clean Product Prefix (CHN, CER, RING, etc.)
  const cleanPrefix = String(prefixFromQuery || "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, "");

  if (!cleanPrefix) {
    throw new Error("Product prefix is required");
  }

  const likePattern = `${companyPrefix}${separator}${cleanPrefix}${separator}%`;

  console.log("Searching for pattern:", likePattern);

  // 3. Find latest SKU with this prefix
  const lastProduct = await models.Product.findOne({
    where: {
      sku_id: {
        [Op.iLike]: likePattern   // Changed from product_code to sku_id
      }
    },
    order: [["sku_id", "DESC"]],   // Changed from product_code to sku_id
    attributes: ["sku_id"],         // Changed from product_code to sku_id
    raw: true,
  });

  let nextSeq = 1;

  if (lastProduct && lastProduct.sku_id) {  // Check sku_id instead of product_code
    console.log("Last product found:", lastProduct.sku_id);
    const parts = lastProduct.sku_id.split(separator);
    const lastNumber = parts[parts.length - 1];
    const num = parseInt(lastNumber, 10);
    if (!isNaN(num)) nextSeq = num + 1;
  } else {
    console.log("No existing product with prefix:", cleanPrefix);
  }

  // 4. Generate next SKU
  const padded = String(nextSeq).padStart(pad, "0");
  const finalSKU = `${companyPrefix}${separator}${cleanPrefix}${separator}${padded}`;

  console.log("Generated SKU:", finalSKU);
  return finalSKU;
};

module.exports = { 
  generateUniqueSkuId, 
  generateUniqueCode, 
  generateFiscalSeriesCode,
  generateProductSKUCode

};