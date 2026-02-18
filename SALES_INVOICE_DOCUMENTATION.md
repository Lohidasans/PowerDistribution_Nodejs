📒 Sales Invoice – Create & Update Flow Note

1️⃣ Core Concepts
Invoice Stock States
~~~~~~~~~~~~~~~~~~~~
An invoice can be in three stock states:
 -Stock NOT deducted
 -Stock deducted
 -Stock deducted but items changed (needs restore + re-deduct)


 2️⃣ Status & Payment Rules
 ~~~~~~~~~~~~~~~~~~~~~~~~~
Invoice Status Rules
___________________________________________________________________________
Action	                                    Status	        Stock Change   |
---------------------------------------------------------------------------
Create Invoice (amount_due = 0)	            Invoice	        ✅ Reduce stock
Create Invoice (amount_due > 0) 	        Invoice	        ❌ No stock
Create Hold Invoice	                        On Hold	        ❌ No stock
Update Hold → Invoice (paid)	            Invoice	        ✅ Reduce stock
Update Invoice → Invoice	                Invoice	        ❌ No stock
Update Invoice → Invoice (items changed)	Invoice	        🔁 Restore → Reduce


3️⃣ When Stock Reduction Is Allowed
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Stock can be reduced only if all conditions are true:

isInvoice === true
hasPayment === true
amount_due === 0


4️⃣ Create Invoice Flow
~~~~~~~~~~~~~~~~~~~~~~~
Steps
    Validate invoice & items
    Save invoice header
    Save invoice items
    Save payments
    Determine stock reduction
    Reduce stock only once
    Mark stock_deducted = true


5️⃣Update Stock Decision Matrix
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
______________________________________________________
stock_deducted	   itemsChanged	        Action        |
______________________________________________________|
false	              false	        ❌ No stock change
false	              true	        ❌ No stock change
false	          N/A + eligible	✅ Reduce
true	             false	        ❌ No stock change
true	             true	        🔁 Restore old → Reduce new



✅ Final Checklist Before Commit
    Fetch old items
    Detect item changes
    Restore stock if required
    Reduce stock only when eligible
    Update stock_deducted correctly
    Run inside a transaction