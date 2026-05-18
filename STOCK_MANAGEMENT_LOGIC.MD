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