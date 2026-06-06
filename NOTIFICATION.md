# Notification Module - Quick Reference

## Notification Messages Location

All SMS templates are maintained in:

```text
constants/notificationMessages.js
```

All notifications should be sent using:

```text
helpers/notificationHelper.js
```

---

# Current Notifications

| Event                    | API / Module       | Recipient            |
| ------------------------ | ------------------ | -------------------- |
| Website Login OTP        | customerSendOTP    | Customer Mobile      |
| New Customer Greeting    | verifyOTP          | Customer Mobile      |
| Discount Approval OTP    | Sales Invoice      | Admin Mobile         |
| Offer Created            | createOffer        | All Customer Mobiles |
| Purchase Confirmation    | createSalesInvoice | Customer Mobile      |
| Saving Scheme Enrollment | createEnrollment   | Customer Mobile      |
| Scheme Due Reminder      | Scheduler / Cron   | Customer Mobile      |
| Google Review Request    | Sales Invoice      | Customer Mobile      |
| Online Order Placed      | Online Order       | Customer Mobile      |
| Order Dispatched         | Online Order       | Customer Mobile      |
| New Branch Opening       | Marketing          | All Customer Mobiles |
| Festive Season Offer     | Marketing          | All Customer Mobiles |

---

# Purchase Notification

### Trigger

Send notification only when:

```js
header.status === "Invoice"
```

Do NOT send for:

```text
On Hold
Draft
Cancelled
```

### Message

```text
CHNIRA: Thank you for your Purchase at Chaneira Jewels! We appreciate your feedback and look forward to serving you again.
Team Chaneira Jewels
```

---

# Offer Notification

### Trigger

After successful offer creation.

### Recipient

All customers.

### General Offer

```text
CHNIRA: Enjoy (5%) OFF on selective Collections!!!
Offer valid from (25 Jan 2024) to (25 Feb 2024).
Visit our store to avail the offer.
Thank You, Team Chaneira Jewels
```

### Material Specific Offer

```text
CHNIRA: Enjoy (5%) OFF on (Silver).
Offer valid from (25 Jan 2024) to (25 Feb 2024).
Visit our store to avail the offer.
Thank You, Team Chaneira Jewels
```

---

# Important Rule

Always send notifications AFTER transaction commit.

✅ Correct

```js
await transaction.commit();

await sendCustomerNotification(...);
```

❌ Wrong

```js
await sendCustomerNotification(...);

await transaction.commit();
```

Reason:
If transaction fails, customer should not receive SMS.

---

# Error Handling

SMS failures should never break business operations.

```js
try {
   await sendCustomerNotification(...);
} catch (err) {
   console.error(err);
}
```

---

# Future Notifications

When adding a new notification:

1. Add message template in `notificationMessages.js`
2. Reuse `sendCustomerNotification()`
3. Send notification only after transaction commit
4. Never fail API because of SMS failure
