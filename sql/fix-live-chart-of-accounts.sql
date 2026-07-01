-- =====================================================================
-- SAFE, ADDITIVE fix for the LIVE (retailerpdb) chart of accounts.
--
-- Brings ledger_group + ledger up to the standard chart WITHOUT dropping,
-- truncating, or moving any existing row. Fully idempotent (safe to re-run).
--
-- >>> This is NOT retailerpdb-jun12026.sql. That file begins with
-- >>> DROP TABLE ... CASCADE and DESTROYS live data. This one never drops.
--
-- What it does:
--   1. Renames  'Direct Incomes'   -> 'Direct Income'    (id 14 kept)
--               'Indirect Incomes' -> 'Indirect Income'  (id 15 kept)
--   2. Creates 'Loans & Borrowings' group if missing
--   3. Inserts the standard leaf ledgers that are missing under each group,
--      resolving groups BY NAME and auto-numbering LAID#### from the current max.
--
-- NEVER touches Sundry Debtors (26) / Sundry Creditors (9) or the customer /
-- vendor ledgers under them (the standard chart adds no leaves to those groups).
-- =====================================================================

BEGIN;

-- 1) Rename plural income groups to the standard singular (id preserved).
UPDATE public.ledger_group
   SET ledger_group_name = 'Direct Income', updated_at = now()
 WHERE lower(trim(ledger_group_name)) = 'direct incomes'
   AND deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.ledger_group x
                    WHERE lower(trim(x.ledger_group_name)) = 'direct income'
                      AND x.deleted_at IS NULL);

UPDATE public.ledger_group
   SET ledger_group_name = 'Indirect Income', updated_at = now()
 WHERE lower(trim(ledger_group_name)) = 'indirect incomes'
   AND deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.ledger_group x
                    WHERE lower(trim(x.ledger_group_name)) = 'indirect income'
                      AND x.deleted_at IS NULL);

-- 2) Create 'Loans & Borrowings' (Liability) if it doesn't already exist.
INSERT INTO public.ledger_group
       (ledger_group_no, ledger_group_name, ledger_account_id, branch_id, status_id, created_at, updated_at)
SELECT 'LGID' || LPAD(
         ((SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(ledger_group_no, '^LGID', '', 'i') AS INTEGER)), 0)
             FROM public.ledger_group
            WHERE ledger_group_no ~* '^LGID[0-9]+$') + 1)::text, 3, '0'),
       'Loans & Borrowings',
       (SELECT id FROM public.ledger_accounts
         WHERE lower(account_name) = 'liability' AND deleted_at IS NULL
         ORDER BY id LIMIT 1),
       1, 1, now(), now()
 WHERE NOT EXISTS (SELECT 1 FROM public.ledger_group
                    WHERE lower(trim(ledger_group_name)) = 'loans & borrowings'
                      AND deleted_at IS NULL);

-- 3) Insert missing standard leaf ledgers (resolve group by name, auto-number).
WITH std(group_name, ledger_name, ord) AS (
  VALUES
    -- Current Assets
    ('Current Assets','Cash in Hand',1),
    ('Current Assets','Bank Accounts',2),
    ('Current Assets','UPI Collections',3),
    ('Current Assets','Card Collections',4),
    ('Current Assets','Customer Receivables',5),
    ('Current Assets','GST Input CGST',6),
    ('Current Assets','GST Input SGST',7),
    ('Current Assets','GST Input IGST',8),
    -- Stock in Hand
    ('Stock in Hand','Gold Stock',9),
    ('Stock in Hand','Silver Stock',10),
    ('Stock in Hand','Stone Stock',11),
    -- Fixed Assets
    ('Fixed Assets','Building',12),
    ('Fixed Assets','Furniture',13),
    ('Fixed Assets','Computer',14),
    ('Fixed Assets','Printer',15),
    ('Fixed Assets','CCTV',16),
    ('Fixed Assets','Vehicle',17),
    ('Fixed Assets','Gold Testing Machine',18),
    -- Deposits
    ('Deposits','Rental Deposit',19),
    ('Deposits','Electricity Deposit',20),
    ('Deposits','Telephone Deposit',21),
    -- Loans & Advances
    ('Loans & Advances','Staff Advance',22),
    ('Loans & Advances','Supplier Advance',23),
    ('Loans & Advances','Advance Tax',24),
    ('Loans & Advances','Branch Advance',25),
    -- Capital Account
    ('Capital Account','Capital A/c',26),
    ('Capital Account','Drawings',27),
    ('Capital Account','Reserve & Surplus',28),
    -- Current Liabilities
    ('Current Liabilities','Outstanding Expenses',29),
    ('Current Liabilities','Salary Payable',30),
    ('Current Liabilities','Rent Payable',31),
    ('Current Liabilities','Customer Advance',32),
    ('Current Liabilities','Scheme Collection Liability',33),
    -- Duties & Taxes
    ('Duties & Taxes','Output CGST',34),
    ('Duties & Taxes','Output SGST',35),
    ('Duties & Taxes','Output IGST',36),
    ('Duties & Taxes','TDS Payable',37),
    ('Duties & Taxes','TCS Payable',38),
    -- Loans & Borrowings
    ('Loans & Borrowings','Gold Loan',39),
    ('Loans & Borrowings','Bank Loan',40),
    ('Loans & Borrowings','Vehicle Loan',41),
    ('Loans & Borrowings','OD Account',42),
    ('Loans & Borrowings','CC Account',43),
    -- Sales Accounts
    ('Sales Accounts','Gold Sales',44),
    ('Sales Accounts','Silver Sales',45),
    ('Sales Accounts','Diamond Sales',46),
    ('Sales Accounts','Stone Sales',47),
    ('Sales Accounts','Old Gold Sales',48),
    ('Sales Accounts','Sales Return',49),
    -- Direct Income (renamed above)
    ('Direct Income','Making Charges Income',50),
    ('Direct Income','Wastage Charges Income',51),
    ('Direct Income','Repair Charges Income',52),
    ('Direct Income','Stone Setting Charges',53),
    ('Direct Income','Certification Charges',54),
    -- Indirect Income (renamed above)
    ('Indirect Income','Interest Received',55),
    ('Indirect Income','Discount Received',56),
    ('Indirect Income','Commission Received',57),
    ('Indirect Income','Rental Income',58),
    -- Purchase Accounts
    ('Purchase Accounts','Gold Purchase',59),
    ('Purchase Accounts','Silver Purchase',60),
    ('Purchase Accounts','Diamond Purchase',61),
    ('Purchase Accounts','Stone Purchase',62),
    ('Purchase Accounts','Old Gold Purchase',63),
    ('Purchase Accounts','Purchase Return',64),
    -- Direct Expenses
    ('Direct Expenses','Hallmark Charges',65),
    ('Direct Expenses','Karigar Charges',66),
    ('Direct Expenses','Stone Purchase Cost',67),
    ('Direct Expenses','Import Charges',68),
    ('Direct Expenses','Wastage Expense',69),
    ('Direct Expenses','Manufacturing Charges',70),
    -- Indirect Expenses
    ('Indirect Expenses','Salary',71),
    ('Indirect Expenses','Rent',72),
    ('Indirect Expenses','Electricity',73),
    ('Indirect Expenses','Internet',74),
    ('Indirect Expenses','Telephone',75),
    ('Indirect Expenses','Advertisement',76),
    ('Indirect Expenses','Printing',77),
    ('Indirect Expenses','Stationery',78),
    ('Indirect Expenses','Audit Fees',79),
    ('Indirect Expenses','Professional Charges',80),
    ('Indirect Expenses','Bank Charges',81),
    ('Indirect Expenses','Courier Charges',82),
    ('Indirect Expenses','Travelling Expenses',83)
),
-- one active group id per name (lowest id wins on any duplicate)
grp AS (
  SELECT DISTINCT ON (lower(trim(ledger_group_name)))
         lower(trim(ledger_group_name)) AS gname, id
    FROM public.ledger_group
   WHERE deleted_at IS NULL
   ORDER BY lower(trim(ledger_group_name)), id ASC
),
resolved AS (
  SELECT s.ledger_name, g.id AS gid, s.ord
    FROM std s
    JOIN grp g ON g.gname = lower(s.group_name)
   WHERE NOT EXISTS (
           SELECT 1 FROM public.ledger l
            WHERE l.ledger_group_id = g.id
              AND lower(trim(l.ledger_name)) = lower(s.ledger_name)
              AND l.deleted_at IS NULL)
),
base AS (
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(ledger_no, '^LAID', '', 'i') AS INTEGER)), 0) AS m
    FROM public.ledger
   WHERE ledger_no ~* '^LAID[0-9]+$'
),
numbered AS (
  SELECT r.ledger_name, r.gid,
         (SELECT m FROM base) + ROW_NUMBER() OVER (ORDER BY r.ord) AS n
    FROM resolved r
)
INSERT INTO public.ledger
       (ledger_no, ledger_name, ledger_group_id, branch_id, created_at, updated_at)
SELECT 'LAID' || LPAD(n::text, 3, '0'), ledger_name, gid, 1, now(), now()
  FROM numbered;

-- Review the row counts, then COMMIT (or ROLLBACK to abort).
COMMIT;
