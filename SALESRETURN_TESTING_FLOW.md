# Sales Return Testing Scenarios

> Important: Do not send the old sales-return-item `id` when replacing the item. Sending that ID edits the existing line instead of removing it./'

## Before each test

- Create a fresh invoice unless the scenario explicitly continues from an earlier step.
- Record the original invoice-line quantity, `returned_quantity`, `is_returned`, and `ProductItemDetail.quantity`.
- `Printed` is the posted/finalized status. Only a printed sales return changes stock and `returned_quantity`.
- Use the exact `invoice_bill_item_id` for the invoice line being returned.

## 1. First partial return

**Setup:** Invoice line quantity is `5`.

**Action:** Create a `Printed` sales return for quantity `2`.

**Expected:**

- Product stock increases by `2`.
- Invoice-line `returned_quantity` becomes `2`.
- Invoice-line `is_returned` remains `false`.



## 2. Return the remaining quantity in another sales return

**Setup:** Continue from Scenario 1.

**Action:** Create another `Printed` sales return for quantity `3` against the same `invoice_bill_item_id`.

**Expected:**

- Product stock increases by `3`.
- Invoice-line `returned_quantity` becomes `5`.
- Invoice-line `is_returned` becomes `true`.




## 3. Attempt a return after the line is fully returned

**Setup:** Invoice-line quantity is `5` and `returned_quantity` is `5`.

**Action:** Create another sales return for the same invoice item.

**Expected:**

- Request is rejected; available return quantity is `0`.
- Product stock does not change.
- `returned_quantity` remains `5`.




## 4. Attempt to return more than the remaining quantity

**Setup:** Invoice-line quantity is `5`; a printed return of `2` already exists.

**Action:** Create another `Printed` sales return for quantity `4`.

**Expected:**

- Request is rejected; only `3` is available.
- Product stock does not change.
- `returned_quantity` remains `2`.



## 5. Create an On Hold return

**Setup:** Invoice-line quantity is `5`.

**Action:** Create an `On Hold` sales return for quantity `2`.

**Expected:**

- Product stock does not change.
- `returned_quantity` remains `0`.
- `is_returned` remains `false`.



## 6. Convert On Hold to Printed

**Setup:** Continue from Scenario 5.

**Action:** Update the same sales return from `On Hold` to `Printed`, keeping quantity `2`.

**Expected:**

- Product stock increases by `2`.
- `returned_quantity` becomes `2`.
- `is_returned` remains `false`.



## 7. Reduce quantity on an existing Printed return

**Setup:** An invoice has two lines: item 1 quantity `5`, item 2 quantity `1`. A printed return contains item 1 with quantity `5`.

**Action:** Update the same sales-return item from quantity `5` to quantity `1`.

**Expected:**

- Item 1 stock is reduced by `4` (only `1` remains returned).
- Item 1 `returned_quantity` becomes `1`.
- Item 1 `is_returned` becomes `false`.
- Item 2 is unchanged.



## 8. Replace one returned item with another

**Setup:** An invoice has two lines: item 1 quantity `5`, item 2 quantity `1`. A printed sales return currently contains item 1 with quantity `1`.

**Action:** Update the sales return so that item 1 is omitted from `items`, and item 2 is sent as a new item without a sales-return-item `id`.

**Expected:**

- Item 1 stock decreases by `1`.
- Item 1 `returned_quantity` becomes `0`.
- Item 1 `is_returned` becomes `false`.
- Item 2 stock increases by `1`.
- Item 2 `returned_quantity` becomes `1`.
- Item 2 `is_returned` becomes `true`.
- The old sales-return item is soft-deleted and a new item-2 return row is created.

> Important: Do not send the old sales-return-item `id` when replacing the item. Sending that ID edits the existing line instead of removing it.



## 9. On Hold quantity edits followed by finalization

**Setup:** Invoice-line quantity is `5`.

**Actions:**

1. Create an `On Hold` sales return for quantity `5`.
2. Update the same On Hold return to quantity `3`.
3. Update the same return to `Printed`, keeping quantity `3`.
4. Update the printed return from quantity `3` to quantity `5`.

**Expected:**

- Steps 1 and 2 do not change stock or `returned_quantity`.
- Step 3 increases stock by `3`; `returned_quantity` becomes `3`.
- Step 4 increases stock by the difference, `2`; `returned_quantity` becomes `5`.
- After Step 4, `is_returned` is `true`.

## Quick verification queries

Verify these values after every scenario:

```sql
SELECT id, quantity, returned_quantity, is_returned
FROM sales_invoice_bill_items
WHERE id = :invoice_bill_item_id;

SELECT id, quantity, stock_out_reason
FROM "ProductItemDetails"
WHERE id = :product_item_detail_id;
```

