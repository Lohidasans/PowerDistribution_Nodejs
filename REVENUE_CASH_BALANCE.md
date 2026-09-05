# Revenue cash balance

`GET /api/v1/revenue/branch-wise-report` now reports carried-forward cash in
each branch row and in `summary.cash`. With a selected date range, cash includes
all cash collections minus completed active cash payments through the range's
end date, including activity before its start date. Branch and payment-mode
filters still apply. Deleted or inactive payment entries remain excluded.

UPI, card and displayed refunds remain selected-period figures. The total combines
the carried-forward cash balance with the other payment modes' period amounts.
Without date filters, existing all-time behavior is retained. An end date alone
limits all modes through that date.

`GET /api/v1/revenue/branch-revenue-details` uses the same date rules for its
summary. Its transaction rows stay within the selected period, so their sum can
differ from the summary by the cash carried forward from earlier dates. Payments
remain listed on their actual payment dates. The UI should label the cash summary
as **Cash Balance**, rather than **Cash Received**, to describe this behavior.

Example: collections of 1,000 before the 11th, a prior cash payment of 100,
collections of 50 on the 11th, and a cash payment of 300 on the 11th produce a
cash balance of 650 on the 11th. A payment on the 12th does not affect that balance.

No payment payload changes or database migration are required.

Run `node scripts/testRevenueCashBalance.js` for read-only PostgreSQL checks
against synthetic rows. It uses the configured database connection but does not
read or change application records.
