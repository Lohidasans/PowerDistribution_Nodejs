// Just to Check grn - updated

SELECT 
    p.id,
    SUM(pid.quantity * pid.net_weight) AS updated_weight,
    SUM(SUM(pid.quantity * pid.net_weight)) OVER () AS total_wt
FROM products p
JOIN "productItemDetails" pid
     ON pid.product_id = p.id
WHERE 
    p.deleted_at IS NULL
    AND pid.deleted_at IS NULL
    AND p.grn_id = 77
    AND p.branch_id = 2
GROUP BY p.id
ORDER BY p.id;

// Ordered
SELECT
grn_id,
  SUM(net_wt_in_g) AS ordered_weight
FROM "grnItems"
WHERE deleted_at IS NULL and grn_id = 81
GROUP BY grn_id



// Check Stock in hand and Sold out weight
SELECT
    p.grn_id,

    -- STOCK WEIGHT
    SUM(pid.quantity * pid.net_weight) AS stock_weight,

    -- SOLD WEIGHT
    COALESCE(SUM(sii.quantity * sii.net_weight),0) AS sold_weight,

    -- UPDATED WEIGHT
    SUM(pid.quantity * pid.net_weight) 
    + COALESCE(SUM(sii.quantity * sii.net_weight),0) AS updated_weight

FROM products p

JOIN "productItemDetails" pid
    ON pid.product_id = p.id
    AND pid.deleted_at IS NULL

LEFT JOIN sales_invoice_bill_items sii
    ON sii.product_item_detail_id = pid.id
    AND sii.deleted_at IS NULL
    AND sii.is_returned = false

LEFT JOIN sales_invoice_bills sib
    ON sib.id = sii.invoice_bill_id
    AND sib.deleted_at IS NULL
    AND sib.status = 'Invoice'

WHERE p.deleted_at IS NULL
AND p.grn_id = 81
AND p.branch_id = 2

GROUP BY p.grn_id;