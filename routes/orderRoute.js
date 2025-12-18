const express = require("express");
const router = express.Router();
const service = require("../services/orderService");

router.get("/orders/generate-code", service.generateOrderCode);
router.post("/orders", service.createOrder);
router.get("/orders", service.getOrders);
router.get("/orders/:id", service.getOrderById);
router.delete("/orders/:id", service.deleteOrder);

module.exports = router;


/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Jewellery order management (Buy Now, Cart/Wishlist conversion)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderItem:
 *       type: object
 *       properties:
 *         product_id:
 *           type: integer
 *         product_item_id:
 *           type: integer
 *         product_name:
 *           type: string
 *         sku_id:
 *           type: string
 *         quantity:
 *           type: integer
 *         rate:
 *           type: number
 *         amount:
 *           type: number
 *         making_charge:
 *           type: number
 *         tax:
 *           type: number
 *         total_amount:
 *           type: number
 *         purity:
 *           type: string
 *         gross_weight:
 *           type: number
 *         net_weight:
 *           type: number
 *         stone_weight:
 *           type: number
 *         measurement_details:
 *           type: array
 *           items:
 *             type: object
 *
 *     CreateOrderRequest:
 *       type: object
 *       required:
 *         - customer_id
 *         - items
 *       properties:
 *         customer_id:
 *           type: integer
 *         discount_amount:
 *           type: number
 *           example: 0
 *         image_url:
 *           type: string
 *           example: https://cdn.example.com/order/img.png
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 */

/**
 * @swagger
 * /api/v1/orders/generate-code:
 *   get:
 *     summary: Generate a new order number
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: prefix
 *         required: false
 *         schema:
 *           type: string
 *           example: ORD
 *     responses:
 *       200:
 *         description: Order number generated successfully
 *         content:
 *           application/json:
 *             example:
 *               statusCode: 200
 *               message: Success
 *               data:
 *                 order_number: ORD-0001
 */

/**
 * @swagger
 * /api/v1/orders/buy-now:
 *   post:
 *     summary: Buy Now / Create Order
 *     description: >
 *       Creates a jewellery order directly from product page, wishlist, or cart.
 *       If item exists in wishlist/cart, it will be hard deleted.
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             example:
 *               statusCode: 201
 *               message: Created
 *               data:
 *                 id: 10
 *                 order_number: ORD-0005
 *                 customer_id: 12
 *                 order_status: 1
 *                 subtotal: 58000
 *                 tax_amount: 1740
 *                 discount_amount: 0
 *                 total_amount: 59740
 *       400:
 *         description: Invalid request or insufficient stock
 */

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     summary: Get list of orders
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: customer_id
 *         required: false
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 */

/**
 * @swagger
 * /api/v1/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order details fetched successfully
 *       404:
 *         description: Order not found
 */

/**
 * @swagger
 * /api/v1/orders/{id}:
 *   delete:
 *     summary: Delete an order
 *     description: Soft deletes the order record
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Order deleted successfully
 *       404:
 *         description: Order not found
 */

