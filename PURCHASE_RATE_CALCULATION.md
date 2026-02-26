# 📘 Purchase Rate Calculation

This document explains how **Purchase Rate** is calculated for the Dashboard KPIs  
(**Sales / Purchase / Profit**).

Purchase value is **NOT stored** in the database.  
It is **calculated dynamically at runtime** based on **sold products** and **GRN rates**.

---

## 🎯 Purpose
To calculate the **actual cost of sold products** so that profit is accurate.

Profit = Sales − Purchase



## 📌 Important Rule

> **Purchase is calculated ONLY for SOLD products**

Only invoices with:

- `sales_invoice_bills.status = 'Invoice'` are considered.

Draft, cancelled, or returned items are excluded.

---

## 🧩 Tables Involved

| Table | Description |
|-----|------------|
| `sales_invoice_bills` | Identifies sold invoices |
| `sales_invoice_bill_items` | Sold products & quantity |
| `products` | Links product to GRN |
| `grnItems` | Source of purchase rate (`rate_per_g`) |
| `productItemDetails` | Source of net weight |

---

## 🔗 Data Relationship Flow

### Product → GRN Rate

sales_invoice_bill_items.product_id
↓
products.id
↓
products.grn_id + products.ref_no_id
↓
grnItems.id (rate_per_g)


### Product → Weight
sales_invoice_bill_items.product_item_detail_id
↓
productItemDetails.net_weight


## 🧮 Purchase Calculation Formula
For **each sold invoice item**:

purchase_amount = grnItems.rate_per_g × productItemDetails.net_weight × sales_invoice_bill_items.quantity



### Field Meaning

| Field | Meaning |
|----|--------|
| `rate_per_g` | Purchase rate per gram (from GRN) |
| `net_weight` | Weight of **one piece** |
| `quantity` | Number of pieces sold |



## ✅ Why Quantity Is Mandatory

Example:

- Rate per gram = ₹500  
- Net weight = 10g  
- Quantity = 2

Purchase = 500 × 10 × 2 = ₹10,000