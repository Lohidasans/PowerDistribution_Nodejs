const calculateItemsAndSubtotal = (items, withId = false) => {
    let subtotal = 0;
    let totalQty = 0;

    const itemRows = items.map(it => {
        const qty = Number(it.quantity || 0);
        const rate = Number(it.rate || 0);
        const itemAmount = qty * rate;
        const itemDiscount = Number(it.discount_amount || 0);
        const amount = itemAmount - itemDiscount;

        subtotal += amount;
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
            discount_amount: itemDiscount,
            amount,
        };

        if (withId) {
            row.id = it.id || null;
        }

        return row;
    });

    return { itemRows, subtotal, totalQty };
};

const calculateHeaderDiscount = (subtotal, header) => {
    let headerDiscountAmt = 0;

    if (header.discount_amount && header.discount_amount > 0) {
        if (header.discount_type === "Percentage") {
            headerDiscountAmt = (subtotal * Number(header.discount_amount)) / 100;
        } else {
            headerDiscountAmt = Number(header.discount_amount);
        }
        headerDiscountAmt = Math.min(headerDiscountAmt, subtotal);
    }

    return headerDiscountAmt;
};

const calculateInvoiceTotal = (subtotal, headerDiscountAmt, header) => {
    const cgstAmt = Number(header.cgst_amount ?? 0);
    const sgstAmt = Number(header.sgst_amount ?? 0);

    let total = subtotal - headerDiscountAmt + cgstAmt + sgstAmt;

    return { total, cgstAmt, sgstAmt };
};

const applyAdjustments = (total, adjustments) => {
    let totalAdjustment = 0;

    if (Array.isArray(adjustments) && adjustments.length > 0) {
        totalAdjustment = adjustments.reduce(
            (sum, adj) => sum + (Number(adj.adjustment_amount) || 0),
            0
        );

        if (totalAdjustment > total) {
            throw new Error(
                `Total adjustment amount (${totalAdjustment}) cannot exceed invoice total (${total})`
            );
        }

        total -= totalAdjustment;
        if (total < 0) total = 0;
    }

    return { total, totalAdjustment };
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
    calculateHeaderDiscount,
    calculateInvoiceTotal,
    applyAdjustments,
    calculatePaymentSummary,
};
