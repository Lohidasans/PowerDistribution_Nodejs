Subcategory will be always created from the Branch_id -1(SuperAdmin).So I have hardcoded the branch_id in the low_Stock and create subcategory api



Subcategory -Reorder Level is 10

Product	Qty
A	    15
B	    15
C	    15
D	    1
E	    0


✅ FINAL BUSINESS FLOW
1.STOCK IN HAND (Product-wise)

Show products/items where:
quantity > 0

Example:
A = 15 ✅
B = 15 ✅
C = 15 ✅
D = 1 ✅

Visible in: stock_in_hand



✅ 2. LOW STOCK (Subcategory-wise)
A subcategory is LOW STOCK when:
products exist under that subcategory
quantity > 0 AND quantity < reorder_level

Example:
subcategory reorder_level = 50
subcategory has 3 products
Product	Item Qty Total
A	10
B	5
C	3

18 < 50
✅ Shows in LOW STOCK


✅ 3. OUT OF STOCK (Subcategory-wise)
A subcategory is OUT OF STOCK when:

CASE 1
No products exist under that subcategory

OR

CASE 2
Products exist, but TOTAL quantity = 0


Stock Management
~~~~~~~~~~~~~~~~~~
Quantity reduces when:
    invoice sale happens
    stock transfer happens
    online order happens

Total Stock Value = Remaining Qty × Purchase Rate
Purchase Rate = GRN rate_per_g × ProductItemDetail.net_weight

Stock-in-hand = No of the qty * grs_wt




