Subcategory -Reorder Level is 15

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