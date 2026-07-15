### Purchase Management Testing Summary

1. **GRN List – Ordered Count**

   * The ordered count should continue to display on the GRN list page even if the corresponding GRN item has been fully or partially returned through a Purchase Return (PR).
   * No changes are required to the ordered quantity logic, as product creation is already restricted to the **non-returned quantity**.

2. **Purchase Return After Product Creation**

   * Tested creating a Purchase Return (PR) after a product was already created.
   * The system correctly restricts this scenario, and a PR cannot be created again for the same GRN item once a product has been created.

3. **Partial Return Validation**

   * Created a product after a partial quantity was returned from the GRN through Purchase Return.
   * The functionality is working as expected because product creation only allows the **remaining (non-returned) quantity**, and only those quantities are displayed in the GRN items.

4. **Purchase Management Testing**

   * Material types are displayed based on the selected vendor.
   * Therefore, the **same vendor** should be used throughout the complete testing flow (Quotation → Purchase Order → GRN → Purchase Return) to ensure the required material types are available and the workflow functions correctly.
