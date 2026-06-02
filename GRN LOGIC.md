## GRN Visibility Logic

### Scenario
- Super Admin (HO Branch) creates **GRN A** with a total quantity of **20**.
- Products created under GRN A:
  - Product A - Qty 10
  - Product B - Qty 10

### Stock Movement
- Product A (Qty 10) remains in the HO branch.
- Product B (Qty 10) is transferred from the HO branch to the Anna Nagar branch.

### GRN List Visibility

#### Super Admin
- When viewing the GRN list, the original GRN should still display:
  - Product A - Qty 10
  - Product B - Qty 10
- Stock transfers should **not affect the product quantities shown in the original GRN**.
- The GRN represents the original goods received, regardless of subsequent stock movements.

#### Branch Admin (Anna Nagar)
- If the Anna Nagar branch admin creates their own GRN (e.g., GRN B), they should only be able to view:
  - GRNs created for the Anna Nagar branch.
- They should **not see GRNs created by the HO branch**, even if stock from those GRNs was later transferred to their branch.

### Key Rule
GRN visibility is based on the **branch that created the GRN**, not on the current stock location after transfers.


-------************--------


## Business Rule:
Super Admin
    See ALL GRNs.
    Can filter by branch dropdown.


Branch Admin (Thoraipakkam = 11)
    See ONLY GRNs created for branch 11.
    Should NOT see HO GRNs.
    Should NOT see HO GRNs just because products were transferred to branch 11.


Order      = GRN quantity received
Updated    = Products created from GRN
Yet Update = Order - Updated


-------************--------





Super admin dashboard:
KPI	 Meaning(it will calculate the transferred pdt also)
Total Purchase --	Original GRN Purchase
Updated    --	Created Products
Yet To Update   ---	Remaining
Total Stock	-- Current Branch Stock


Total Purchase should follow GRN branch - 
If GRN created in HO branch and then
products transferred to branch A later

No GRNs exist with branch A