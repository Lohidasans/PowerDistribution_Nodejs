# Stock KPI - Branch-wise Business Logic

## Purpose

The Stock KPI dashboard should distinguish between:

1. **Purchases made by a branch**
2. **Stock currently available in a branch**

These are different concepts and should not be mixed.

---

# Scenario

## Head Office (Branch 1)

- Creates a GRN.
- Creates Products from that GRN.
- Transfers the products to Branch 22.

Example:

GRN
- Branch: 1
- Total Amount: ₹16,610
- Quantity: 3
- Weight: 58.528g

Product
- Initially created in Branch 1
- Later transferred to Branch 22

---

# Expected Dashboard Values

## Branch 1 (Head Office)

### Total Purchase
✔ Show the GRN because it was created in Branch 1.

Result:
- Amount: ₹16,610
- Qty: 3
- Weight: 58.528g

---

### Updated

✔ Show as Updated because the products were created from Branch 1's GRN.

Result:
- Qty: 3
- Weight: 58.528g

---

### Yet To Update

Remaining products that are not converted.

Result:
- Qty: 0
- Weight: 0

---

### Total Stock

Since the products were transferred to Branch 22, they are no longer available in Branch 1.

Result:
- Qty: 0
- Weight: 0

---

## Branch 22

### Total Purchase

❌ Do NOT show the GRN.

Reason:
Branch 22 never purchased these items.
It only received them through a stock transfer.

Result:
- Amount: ₹0
- Qty: 0
- Weight: 0

---

### Updated

❌ Do NOT count these products.

Reason:
Updated should only represent products created from GRNs that belong to the selected branch.

Result:
- Qty: 0
- Weight: 0

---

### Yet To Update

Since Branch 22 has no purchase, there is nothing pending to update.

Result:
- Qty: 0
- Weight: 0

---

### Total Stock

✔ Show the transferred products.

Reason:
These products currently belong to Branch 22.

Result:
- Qty: 3
- Weight: 58.528g

---

# Branch Filter Rules

## Total Purchase

Filter using:

```
grns.branch_id
```

Reason:

Only purchases made by the selected branch should be displayed.

---

## Updated

Filter using:

```
grns.branch_id
```

Reason:

Updated means products created from that branch's own purchases.

Transferred products should not increase the Updated count.

---

## Yet To Update

Calculated as:

```
Total Purchase - Updated
```

Since both values are based on the GRN branch, the calculation remains correct.

---

## Total Stock

Filter using:

```
products.branch_id
```

Reason:

Stock belongs to the branch that currently owns the product.

Transferred products should appear here.

---

# Summary

| KPI | Filter By | Includes Transferred Products? |
|------|-----------|-------------------------------|
| Total Purchase | grns.branch_id | ❌ No |
| Updated | grns.branch_id | ❌ No |
| Yet To Update | grns.branch_id | ❌ No |
| Total Stock | products.branch_id | ✅ Yes |

---

# Important Note

A branch can own stock without having purchased it.

Example:

- Head Office purchases products.
- Head Office transfers products to another branch.

The receiving branch should:

- Not receive purchase credit.
- Not receive updated credit.
- Not receive yet-to-update records.
- Only receive stock.

This keeps purchase analytics and stock analytics independent and prevents transferred stock from being counted as a new purchase.