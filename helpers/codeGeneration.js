const { Op } = require("sequelize");

const generateAutoCode = async (model, field, prefix) => {
  const lastEntry = await model.findOne({
    order: [["id", "DESC"]],
    attributes: [field],
  });

  let nextNumber = 1;
  if (lastEntry?.[field]) {
    const match = lastEntry[field].match(/(\d+)$/);
    if (match) nextNumber = parseInt(match[1]) + 1;
  }

  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
};

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

/**
 * Generate codes like 'VEN 01/24-25' with per-fiscal-year sequence.
  * The numeric part resets each FY. Example: VEN 01/24-25, VEN 02/24-25, ...
 */
const generateFiscalSeriesCode = async (
    model,
    field,
    prefix,
    { pad = 2, fyRange: fyOverride } = {}
) => {
    // Normalize prefix and FY range
    const cleanPrefix = String(prefix || "").trim().toUpperCase();

    let fyRange = "";
    if (fyOverride && typeof fyOverride === "string") {
        const cleaned = fyOverride.replace(/\s+/g, "").replace(/-/g, "/");
        const parts = cleaned.split("/");
        if (parts.length === 2) {
            const a = parts[0].padStart(2, "0");
            const b = parts[1].padStart(2, "0");
            fyRange = `${a}/${b}`; // internal slash form
        }
    }

    if (!fyRange) {
        return null; // Safety check — FY must be provided
    }

    // Build patterns for both slash and hyphen FY notations
    const fySlash = fyRange;               // e.g., 24/25
    const fyHyphen = fyRange.replace('/', '-'); // e.g., 24-25

    // Search last code matching either notation
    const searchOr = {
        [Op.or]: [
            { [field]: { [Op.iLike]: `${cleanPrefix} %/${fySlash}` } },
            { [field]: { [Op.iLike]: `${cleanPrefix} %/${fyHyphen}` } },
        ],
    };

    // Find the last created vendor code in the same FY
    const lastEntry = await model.findOne({
        where: searchOr,
        order: [["id", "DESC"]],
        attributes: [field],
    });

    // Determine next number
    let nextNumber = 1;
    if (lastEntry?.[field]) {
        const escPrefix = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escSlash = fySlash.replace('/', '\\/');
        const escHyphen = fyHyphen.replace('-', '\\-');
        const regex = new RegExp(`^${escPrefix}\\s(\\d+)/(?:${escSlash}|${escHyphen})$`, "i");
        const match = String(lastEntry[field]).match(regex);
        if (match) nextNumber = parseInt(match[1], 10) + 1;
    }

    // Generate new code (only the numeric part increases)
    // Always output with hyphen between years
    const newCode = `${cleanPrefix} ${String(nextNumber).padStart(pad, "0")}/${fyHyphen}`;
    return newCode;
};

module.exports =  { 
  generateAutoCode, 
  generateUniqueSkuId, 
  generateUniqueCode, 
  generateFiscalSeriesCode 
};