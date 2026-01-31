const { ValidationError } = require("../utils/errors");

const calculateItemsAndSubtotal = (items, withId = false) => {
    let netTotal = 0;
    let totalQty = 0;

    const itemRows = items.map(it => {
        const qty = Number(it.quantity || 0);
        const rate = Number(it.rate || 0);
        const itemAmount = qty * rate;
        const itemDiscount = Number(it.discount_amount || 0);
        const amount = itemAmount - itemDiscount; // item-level discount

        netTotal += amount;
        totalQty += qty;

        const row = {
            product_id: it.product_id,
            product_item_detail_id: it.product_item_detail_id ?? null,
            hsn_code: it.hsn_code ?? null,
            product_name_snapshot: it.product_name_snapshot ?? null,
            net_weight: it.net_weight,
            gross_weight: it.gross_weight,
            wastage: it.wastage,
            quantity: qty,
            rate,
            discount_amount: itemDiscount, // keep item discount
            amount,                         // net item amount
        };

        if (withId) {
            row.id = it.id || null;
        }

        return row;
    });

    return { itemRows, netTotal, totalQty };
};

/*
const calculateInvoiceTotals = ({
    subtotal,
    header,
    adjustments = []
}) => {
    const hasHeaderIgst =
        header.igst_amount && Number(header.igst_amount) > 0;
    const cgstAmt = hasHeaderIgst ? 0 : Number(header.cgst_amount ?? 0);
    const sgstAmt = hasHeaderIgst ? 0 : Number(header.sgst_amount ?? 0);
    const igstAmt = hasHeaderIgst ? 0 : Number(header.igst_amount ?? 0);

    // subtotal + tax
    let total = subtotal + cgstAmt + sgstAmt + igstAmt;  // 1490 + 15+15 = 1520

    // adjustments
    let totalAdjustment = 0;
    if (Array.isArray(adjustments) && adjustments.length > 0) {
        totalAdjustment = adjustments.reduce(
            (sum, a) => sum + Number(a.adjustment_amount || 0),
            0
        );

        if (totalAdjustment > total) {
            throw new ValidationError(
                `Total adjustment amount (${totalAdjustment}) cannot exceed invoice total (${total})`
            );
        }

        total -= totalAdjustment;
    }

    // header discount (AFTER adjustments)
    let headerDiscountAmt = 0;
    if (header.discount_amount && header.discount_amount > 0) {
        if (header.discount_type === "Percentage") {
            headerDiscountAmt = (total * Number(header.discount_amount)) / 100; // 1520* 5/100  = 76
        } else {
            headerDiscountAmt = Number(header.discount_amount);
        }

        headerDiscountAmt = Math.min(headerDiscountAmt, total);
        total -= headerDiscountAmt;
    }

    // round
    total = Math.round(total); //1,444

    return {
        total,
        cgstAmt,
        sgstAmt,
        igstAmt,
        headerDiscountAmt,
        totalAdjustment,
        hasHeaderIgst
    };
};  */

const calculateInvoiceTotals = ({
    netTotal,
    header,
    adjustments = []
}) => {
    const hasHeaderIgst = header.igst_amount && Number(header.igst_amount) > 0;

    const cgstAmt = hasHeaderIgst ? 0 : Number(header.cgst_amount ?? 0);
    const sgstAmt = hasHeaderIgst ? 0 : Number(header.sgst_amount ?? 0);
    const igstAmt = hasHeaderIgst ? Number(header.igst_amount ?? 0) : 0;

    const gstTotal = cgstAmt + sgstAmt + igstAmt;
    const GST_FACTOR = 1.03;

    let discountCalculated = 0;
    let discountGross = 0; //what user discount equals in money

    // DISCOUNT CALCULATION
    if (header.discount_amount && header.discount_amount > 0) {
        if (header.discount_type === "Amount") {
            discountGross = Number(header.discount_amount); // user value
            discountCalculated = discountGross / GST_FACTOR;
        } 

        if (header.discount_type === "Percentage") {
            const grantTotalBeforeDiscount = netTotal + gstTotal;
            discountGross =
                (grantTotalBeforeDiscount * Number(header.discount_amount)) / 100;

            discountCalculated = discountGross / GST_FACTOR;
        }

        discountCalculated = Math.min(discountCalculated, netTotal);
    }

    // SUBTOTAL & TOTAL
    const subtotal = netTotal - discountCalculated;
    let total = subtotal + gstTotal;

    // ADJUSTMENTS (LAST)
    let totalAdjustment = 0;
    if (Array.isArray(adjustments) && adjustments.length > 0) {
        totalAdjustment = adjustments.reduce(
            (sum, a) => sum + Number(a.adjustment_amount || 0),
            0
        );

        if (totalAdjustment > total) {
            throw new ValidationError(
                `Total adjustment amount (${totalAdjustment}) cannot exceed invoice total (${total})`
            );
        }

        total -= totalAdjustment;
    }

    total = Math.round(total);

    return {
        netTotal,
        subtotal,
        total,
        discountGross,        // user-facing discount value
        discountCalculated,   // actual pre-GST discount
        cgstAmt,
        sgstAmt,
        igstAmt,
        totalAdjustment,
        hasHeaderIgst
    };
};


const calculatePaymentSummary = (payments, total) => {
    const totalPaid = payments.reduce(
        (sum, p) => sum + Number(p.amount_received || 0),
        0
    );

    let refundAmount = 0;
    let amountDue = total;

    if (totalPaid > total) {
        refundAmount = totalPaid - total;
        amountDue = 0;
    } else {
        amountDue = total - totalPaid;
    }

    return { totalPaid, refundAmount, amountDue };
};

module.exports = {
    calculateItemsAndSubtotal,
    calculateInvoiceTotals,
    calculatePaymentSummary,
};
