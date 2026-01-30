var express = require("express");
var deliveryChellanRouter = express.Router();
const deliveryChellanService = require("../services/deliveryChellanService");

/* ================= ROUTES ================= */

deliveryChellanRouter.post(
  "/delivery-chellan",
  deliveryChellanService.createDeliveryChellan
);
deliveryChellanRouter.get(
  "/delivery-chellan/code",
  deliveryChellanService.generateDeliveryChallanNo
);
deliveryChellanRouter.get(
  "/delivery-chellan",
  deliveryChellanService.getAllDeliveryChellans
);

deliveryChellanRouter.get(
  "/delivery-chellan/:id",
  deliveryChellanService.getDeliveryChellanById
);

deliveryChellanRouter.put(
  "/delivery-chellan/:id",
  deliveryChellanService.updateDeliveryChellan
);

deliveryChellanRouter.delete(
  "/delivery-chellan/:id",
  deliveryChellanService.deleteDeliveryChellan
);
deliveryChellanRouter.delete(
  "/delivery-chellan/:delivery_chellan_id/status",
  deliveryChellanService.updateDeliveryChellanClose
);
// 🔥 delete single delivery chellan item
deliveryChellanRouter.delete(
  "/delivery-chellan/:delivery_chellan_id/item/:id",
  deliveryChellanService.deleteDeliveryChellanItem
);


module.exports = deliveryChellanRouter;

/**
 * @openapi
 * tags:
 *   - name: DeliveryChellan
 *     description: Delivery Chellan management
 */

/**
 * @openapi
 * /api/v1/delivery-chellan:
 *   post:
 *     summary: Create delivery chellan with items
 *     tags: [DeliveryChellan]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               delivery_challan_no: { type: string }
 *               date: { type: string, format: date }
 *               delivery_challan_type_id: { type: integer }
 *               vendor_id: { type: integer }
 *               ref_no: { type: string }
 *               amount_in_words: { type: string }
 *               sub_total: { type: number }
 *               sgst: { type: number }
 *               cgst: { type: number }
 *               igst: { type: number }
 *               discount: { type: number }
 *               total_amount: { type: number }
 *               remarks: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     sku_id: { type: string }
 *                     product_description: { type: string }
 *                     quantity: { type: integer }
 *                     weight: { type: number }
 *                     amount: { type: number }
 *     responses:
 *       201:
 *         description: Created
 *
 *   get:
 *     summary: List delivery chellans with items
 *     tags: [DeliveryChellan]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: vendor_id
 *         schema: { type: integer }
 *       - in: query
 *         name: delivery_challan_type_id
 *         schema: { type: integer }
 *       - in: query
 *         name: date_from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: date_to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/delivery-chellan/{id}:
 *   get:
 *     summary: Get delivery chellan by ID
 *     tags: [DeliveryChellan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *
 *   put:
 *     summary: Update delivery chellan and replace items
 *     tags: [DeliveryChellan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ref_no: { type: string }
 *               remarks: { type: string }
 *               sub_total: { type: number }
 *               discount: { type: number }
 *               total_amount: { type: number }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     sku_id: { type: string }
 *                     product_description: { type: string }
 *                     quantity: { type: integer }
 *                     weight: { type: number }
 *                     amount: { type: number }
 *     responses:
 *       200:
 *         description: OK
 *
 *   delete:
 *     summary: Delete delivery chellan (soft)
 *     tags: [DeliveryChellan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */

/**
 * @openapi
 * /api/v1/delivery-chellan/{delivery_chellan_id}/item/{id}:
 *   delete:
 *     summary: Delete delivery chellan item
 *     tags: [DeliveryChellan]
 *     parameters:
 *       - in: path
 *         name: delivery_chellan_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
