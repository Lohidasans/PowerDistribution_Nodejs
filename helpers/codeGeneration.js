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

  // Find last record for this prefix
  const lastEntry = await model.findOne({
    where: {
      [field]: { [Op.iLike]: `${cleanPrefix}%` },
    },
    order: [["id", "DESC"]],
    attributes: [field],
  });

  let nextNumber = 1;

  if (lastEntry?.[field]) {
    // Match numeric suffix (e.g., EST023 → 23)
    const regex = new RegExp(`^${cleanPrefix}(\\d+)$`, "i");
    const match = String(lastEntry[field]).match(regex);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }

  // Return code like EST001
  return `${cleanPrefix}${String(nextNumber).padStart(pad, "0")}`;
};


const generateProductSKUCode = async (prefixFromQuery = "", options = {}) => {
  const {
    pad = 3,          // 001, 002, 003
    separator = "_",  // CJ_CER_001
  } = options;

  // 1. Load Super Admin
  const superAdmin = await models.SuperAdminProfile.findOne({
    order: [["id", "ASC"]],
  });

  if (!superAdmin) {
    throw new Error("Super Admin Profile not found");
  }

  // 2. Validate company base prefix
  const companyPrefix = String(superAdmin.branch_sequence_value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!companyPrefix) {
    throw new Error("Company prefix missing in Super Admin Profile");
  }

  // 3. Clean prefixFromQuery
  const cleanPrefix = String(prefixFromQuery || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!cleanPrefix) {
    throw new Error("Invalid product prefix");
  }

  // 4. Use correct sequence field
  const currentSeq = Number(superAdmin.product_sequence_value || 0);
  const nextSeq = String(currentSeq + 1).padStart(pad, "0");

  // 5. Final code: CJ_CER_001
  const finalCode = [companyPrefix, cleanPrefix, nextSeq].join(separator);

  // 6. Update DB sequence
  superAdmin.product_sequence_value = currentSeq + 1;
  await superAdmin.save();

  return finalCode;
};

module.exports = { 
  generateUniqueSkuId, 
  generateUniqueCode, 
  generateFiscalSeriesCode,
  generateProductSKUCode

};