/**
 * GSTR-1 invoice classification.
 *
 * Decides which GSTR-1 section an outward-supply invoice belongs to and builds
 * the snapshot stored on sales_invoice_bills at save time, so the report can
 * bucket invoices without re-deriving from the (mutable) customer master.
 *
 * Precedence (first match wins):
 *   EXP    – export invoice (is_export = true)
 *   EXEMP  – nil rated / exempt / non-GST supply (supply_type != 'Taxable')
 *   B2B    – recipient has a GSTIN
 *   B2CL   – unregistered + inter-state + invoice value >= ₹2,50,000
 *   B2CS   – everything else (the typical retail walk-in sale)
 *
 * Inter-state is taken from igst_amount > 0: the billing UI already chooses
 * CGST/SGST vs IGST at bill time, so a non-zero IGST is the authoritative
 * inter-state signal (no separate state comparison needed).
 */

const B2CL_THRESHOLD = 250000; // ₹2,50,000

const hasGstin = (gstin) => !!(gstin && String(gstin).trim());

function classifyInvoiceForGstr1({
  customerGstin,
  isExport = false,
  supplyType = "Taxable",
  igstAmount = 0,
  totalAmount = 0,
}) {
  if (isExport === true) return "EXP";
  if (supplyType && supplyType !== "Taxable") return "EXEMP";
  if (hasGstin(customerGstin)) return "B2B";

  const interState = Number(igstAmount || 0) > 0;
  if (interState && Number(totalAmount || 0) >= B2CL_THRESHOLD) return "B2CL";
  return "B2CS";
}

/**
 * Build the full GSTR-1 snapshot for an invoice being created/updated.
 *
 * @param {object}  args
 * @param {object}  args.header       invoice header from the request body
 * @param {number}  args.cgstAmt      resolved CGST amount (0 for inter-state)
 * @param {number}  args.sgstAmt      resolved SGST amount (0 for inter-state)
 * @param {number}  args.igstAmt      resolved IGST amount (0 for intra-state)
 * @param {object}  args.models       sequelize models registry
 * @param {object} [args.transaction] active transaction
 * @param {object} [args.existing]    current invoice record (edit path) so flags
 *                                    the UI does not send are preserved, not wiped
 * @returns {Promise<object>} columns to spread onto the SalesInvoiceBill record
 */
async function buildInvoiceGstSnapshot({
  header,
  cgstAmt = 0,
  sgstAmt = 0,
  igstAmt = 0,
  models,
  transaction,
  existing = null,
}) {
  // Snapshot the customer's GSTIN and home state (place of supply). For a
  // walk-in with no customer master row we fall back to the branch's state.
  let customer = null;
  if (header.customer_id) {
    customer = await models.Customer.findByPk(header.customer_id, {
      attributes: ["id", "gst_no", "state_id"],
      transaction,
      raw: true,
    });
  }

  let stateId = customer?.state_id || null;
  if (!stateId && header.branch_id) {
    const branch = await models.Branch.findByPk(header.branch_id, {
      attributes: ["state_id"],
      transaction,
      raw: true,
    });
    stateId = branch?.state_id || null;
  }

  let place_of_supply = null;
  let place_of_supply_code = null;
  if (stateId) {
    const state = await models.State.findByPk(stateId, {
      attributes: ["state_name", "state_code"],
      transaction,
      raw: true,
    });
    place_of_supply = state?.state_name || null;
    place_of_supply_code = state?.state_code || null;
  }

  const customer_gstin = hasGstin(customer?.gst_no)
    ? String(customer.gst_no).trim()
    : null;

  // These optional flags come from the header when the billing UI sends them.
  // On edit, fall back to the stored value (not the default) so a normal invoice
  // edit that omits them does not silently wipe a previously set flag.
  const is_export =
    header.is_export !== undefined ? header.is_export === true : existing?.is_export === true;
  const export_type = is_export
    ? header.export_type ?? existing?.export_type ?? null
    : null;
  const reverse_charge =
    header.reverse_charge !== undefined
      ? header.reverse_charge === true
      : existing?.reverse_charge === true;
  const supply_type = header.supply_type ?? existing?.supply_type ?? "Taxable";

  // GSTR-1 invoice value = gross document value (taxable + tax), NOT the stored
  // total_amount (which is net of old-gold / scheme / sales-return adjustments).
  const grossInvoiceValue =
    Number(header.subtotal_amount || 0) + Number(cgstAmt || 0) + Number(sgstAmt || 0) + Number(igstAmt || 0);

  const gstr1_category = classifyInvoiceForGstr1({
    customerGstin: customer_gstin,
    isExport: is_export,
    supplyType: supply_type,
    igstAmount: igstAmt,
    totalAmount: grossInvoiceValue,
  });

  return {
    customer_gstin,
    place_of_supply,
    place_of_supply_code,
    is_export,
    export_type,
    reverse_charge,
    supply_type,
    gstr1_category,
  };
}

module.exports = {
  classifyInvoiceForGstr1,
  buildInvoiceGstSnapshot,
  B2CL_THRESHOLD,
};
