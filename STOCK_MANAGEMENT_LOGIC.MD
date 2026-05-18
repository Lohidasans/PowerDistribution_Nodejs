Subcategory will be alwasys created from the Branch_id -1(SuperAdmin).So I have hardcoded the branch_id in the low_Stock and create subcategory api



Subcategory -Reorder Level is 10

Product	Qty
A	    15
B	    15
C	    15
D	    1
E	    0


✅ FINAL BUSINESS FLOW
1. STOCK IN HAND

Show products/items where:
quantity > 0

Example:
A = 15 ✅
B = 15 ✅
C = 15 ✅
D = 1 ✅

Visible in: stock_in_hand



✅ 2. LOW STOCK

Show products/items where:
quantity > 0 AND quantity < reorder_level

Example:
Reorder level = 10

D = 1 ✅ low stock
E = 0 ❌ not low stock
A = 15 ❌ not low stock

So D appears:
stock_in_hand ✅
low_stock ✅



✅ 3. OUT OF STOCK

Show:
products/items having quantity = 0
OR
subcategories with no products at all

Example:
E = 0 ✅ out of stock
Empty subcategory ✅ out of stock



Subcategory reorder level = 10

Product	Qty	Result
A	15	stock_in_hand
B	15	stock_in_hand
C	15	stock_in_hand
D	1	stock_in_hand + low_stock
E	0	out_of_stock




Query to Check Low stock:
SELECT
    sc.id AS subcategory_id,
    sc.subcategory_name,
    sc.reorder_level,

    COUNT(DISTINCT p.id) AS total_products,

    COALESCE(SUM(pid.quantity), 0) AS total_quantity

FROM subcategories sc

LEFT JOIN products p
    ON p.subcategory_id = sc.id
    AND p.deleted_at IS NULL
    AND p.branch_id = 6

LEFT JOIN "productItemDetails" pid
    ON pid.product_id = p.id
    AND pid.deleted_at IS NULL

GROUP BY
    sc.id,
    sc.subcategory_name,
    sc.reorder_level

HAVING

    -- Empty subcategory
    COUNT(DISTINCT p.id) = 0

    OR

    -- Products exist but ALL quantities are exactly 0
    (
        COUNT(pid.id) > 0
        AND MAX(pid.quantity) = 0
        AND MIN(pid.quantity) = 0
    )

ORDER BY sc.subcategory_name;