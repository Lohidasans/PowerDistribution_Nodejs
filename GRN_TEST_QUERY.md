// Just to Check grn - updated

SELECT
p.grn_id,
  SUM(pid.net_weight) AS updated_weight
FROM products p
JOIN "productItemDetails" pid 
     ON pid.product_id = p.id
WHERE
p.deleted_at IS NULL
    AND pid.deleted_at IS NULL
    AND p.grn_id = 81
    AND p.branch_id =1
GROUP BY p.grn_id;

// Ordered
SELECT
grn_id,
  SUM(net_wt_in_g) AS ordered_weight
FROM "grnItems"
WHERE deleted_at IS NULL and grn_id = 81
GROUP BY grn_id
