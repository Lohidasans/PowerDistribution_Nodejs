# Sales Invoice Deactivation - Summary

When a Sales Invoice is deactivated (`is_active = false`), all impacts created by that invoice are reversed.

## 1. Stock Restoration

If stock was deducted during invoice creation:

* Fetch invoice items from `sales_invoice_bill_items`
* Restore quantity back to `product_item_details`
* Set `stock_out_reason = null`
* Update invoice `stock_deducted = false`

### Fields Updated

* `product_item_details.quantity` → Increased
* `product_item_details.stock_out_reason` → NULL
* `sales_invoice_bills.stock_deducted` → false

---

## 2. Unlock Bill Adjustments

If the invoice used:

* Sales Return
* Old Jewel
* Saving Scheme

those records are made available again.

### Fields Updated

| Table         | Field                    |
| ------------- | ------------------------ |
| sales_returns | is_bill_adjusted = false |
| old_jewels    | is_bill_adjusted = false |
| enrollments   | is_bill_adjusted = false |

---

## 3. Restore Advance Amount

If advance receipts were used:

* Fetch advance receipt numbers from invoice payments
* Get corresponding records from `voucher_receipts`
* Find customer using:

```text
voucher_receipts.account_id = customers.ledger_id
```

* Add receipt amount back to customer wallet
* Mark receipt reusable(Voucher-AccountNo - dropdown)

### Fields Updated

| Table            | Field                                   |
| ---------------- | --------------------------------------- |
| customers        | wallet_advance_amount += receipt.amount |
| voucher_receipts | is_advance_used = false                 |

---

## 4. Deactivate Invoice

Invoice is marked inactive.

### Fields Updated

| Table               | Field             |
| ------------------- | ----------------- |
| sales_invoice_bills | is_active = false |

---

# Final Result

✅ Stock restored

✅ Sales Return unlocked

✅ Old Jewel unlocked

✅ Saving Scheme unlocked

✅ Customer advance restored

✅ Advance receipt reusable again

✅ Invoice marked inactive

---

# Tables Affected

* sales_invoice_bills
* sales_invoice_bill_items
* product_item_details
* sales_invoice_adjustments
* sales_returns
* old_jewels
* enrollments
* payments
* voucher_receipts
* customers

  
-------------------------************************-------------------------------------

# Sales Invoice Deactivation Flow

## Overview

When a Sales Invoice is deactivated (`is_active = false`), all business impacts created by that invoice must be reversed.

The purpose of deactivation is to completely roll back the invoice effects and make all related entities available for reuse.

A deactivated invoice **cannot be reactivated**.

---

# API

```http
PUT /sales-invoice-bills/:id/toggle-active
```

### Request

```json
{
  "is_active": false
}
```

---

# Validation

## Prevent Reactivation

If an invoice has already been deactivated:

```json
{
  "message": "Deactivated invoice cannot be activated again"
}
```

Only deactivation is allowed.

---

# Deactivation Process

The following operations are executed inside a database transaction.

---

# 1. Restore Inventory Stock

## Condition

```js
invoice.stock_deducted === true
```

Only invoices that previously deducted stock are restored.

---

## Tables Affected

### sales_invoice_bill_items

Fetch all invoice items:

```sql
sales_invoice_bill_items
```

---

### product_item_details

For every invoice item:

```js
quantity += invoice_item.quantity
```

Example:

Before:

```text
Quantity = 3
Invoice Qty = 2
```

After restoration:

```text
Quantity = 5
```

---

## Fields Updated

### product_item_details

| Field            | Action      |
| ---------------- | ----------- |
| quantity         | Increased   |
| stock_out_reason | Set to NULL |

---

### sales_invoice_bills

| Field          | Action |
| -------------- | ------ |
| stock_deducted | false  |

---

# 2. Unlock Bill Adjustments

If the invoice was created using:

* Sales Return
* Old Jewel
* Saving Scheme

those records become available again for future invoices.

---

## Table

```sql
sales_invoice_adjustments
```

Fetch all adjustments linked to the invoice.

---

## Adjustment Type Mapping

| adjustment_type_id | Entity        |
| ------------------ | ------------- |
| 1                  | Sales Return  |
| 2                  | Old Jewel     |
| 3                  | Saving Scheme |

---

## Sales Return

### Table

```sql
sales_returns
```

### Update

```js
is_bill_adjusted = false
```

---

## Old Jewel

### Table

```sql
old_jewels
```

### Update

```js
is_bill_adjusted = false
```

---

## Saving Scheme

### Table

```sql
enrollments
```

### Update

```js
is_bill_adjusted = false
```

---

## Fields Restored

| Table         | Field            |
| ------------- | ---------------- |
| sales_returns | is_bill_adjusted |
| old_jewels    | is_bill_adjusted |
| enrollments   | is_bill_adjusted |

---

# 3. Restore Advance Amount

## Background

Advance payments are collected through:

```sql
voucher_receipts
```

with:

```text
bill_type_id = 3
```

(Advance Receipt)

---

## Invoice Creation Flow

When advance is used:

### Customer Wallet

```js
wallet_advance_amount -= receipt.amount
```

### Voucher Receipt

```js
is_advance_used = true
```

---

# Deactivation Flow

The above process is reversed.

---

## Step 1

Fetch all invoice payments having:

```text
payment_mode = "Advance"
```

from:

```sql
payments
```

---

## Step 2

Obtain receipt numbers:

```js
transaction_id -> receipt_no
```

---

## Step 3

Fetch receipts from:

```sql
voucher_receipts
```

where:

```text
bill_type_id = 3
```

---

## Step 4

Find customer using:

```text
voucher_receipts.account_id
=
customers.ledger_id
```

---

## Step 5

Restore wallet balance:

```js
customer.wallet_advance_amount += receipt.amount
```

---

## Step 6

Mark receipt reusable:

```js
voucher_receipts.is_advance_used = false
```

---

## Tables Updated

### customers

| Field                 | Action    |
| --------------------- | --------- |
| wallet_advance_amount | Increased |

---

### voucher_receipts

| Field           | Action |
| --------------- | ------ |
| is_advance_used | false  |

---

# 4. Deactivate Invoice

Finally the invoice itself is marked inactive.

### Table

```sql
sales_invoice_bills
```

### Update

```js
is_active = false
```

---

# Final Result

After deactivation:

## Inventory

✅ Stock restored

```text
product_item_details.quantity restored
```

---

## Sales Return

✅ Available again

```text
is_bill_adjusted = false
```

---

## Old Jewel

✅ Available again

```text
is_bill_adjusted = false
```

---

## Saving Scheme

✅ Available again

```text
is_bill_adjusted = false
```

---

## Advance Receipt

✅ Reusable again

```text
voucher_receipts.is_advance_used = false
```

---

## Customer Wallet

✅ Advance amount restored

```text
wallet_advance_amount increased
```

---

## Invoice

✅ Marked inactive

```text
sales_invoice_bills.is_active = false
```

---

# Tables Impacted During Invoice Deactivation

| Table                     |
| ------------------------- |
| sales_invoice_bills       |
| sales_invoice_bill_items  |
| product_item_details      |
| sales_invoice_adjustments |
| sales_returns             |
| old_jewels                |
| enrollments               |
| payments                  |
| voucher_receipts          |
| customers                 |

---

# Rollback Summary

| Business Impact         | Invoice Creation | Invoice Deactivation |
| ----------------------- | ---------------- | -------------------- |
| Stock                   | Reduced          | Restored             |
| Sales Return            | Locked           | Unlocked             |
| Old Jewel               | Locked           | Unlocked             |
| Saving Scheme           | Locked           | Unlocked             |
| Customer Advance Wallet | Reduced          | Restored             |
| Advance Receipt         | Used             | Reusable             |
| Invoice Status          | Active           | Inactive             |

This ensures complete reversal of all inventory, adjustment, advance-payment, and accounting effects created by the Sales Invoice.
