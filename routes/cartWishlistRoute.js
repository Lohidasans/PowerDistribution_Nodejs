const express = require("express");
const router = express.Router();
const service = require("../services/cartWishlistService");

// Add to Wishlist / Cart
router.post("/user-items", service.addItem);

// Move wishlist → cart
router.put("/user-items/:id/move", service.moveItem);

// Update cart quantity
router.put("/user-items/:id/quantity", service.updateQuantity);

// Remove item
router.delete("/user-items/:id", service.removeItem);

// toggle wishlist status by product
router.put("/user-items/wish-list/:product_id", service.updateWishlistByProduct);

// toggle add to cart status by product
router.put("/user-items/add-to-cart/:product_id", service.updateCartByProduct);

// List wishlist or cart
// ?user_id=1&type=1 (wishlist)
// ?user_id=1&type=2 (cart)
router.get("/user-items", service.listItems);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Cart & Wishlist
 *   description: Wishlist and Cart management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CartWishlistItem:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         user_id:
 *           type: integer
 *         product_id:
 *           type: integer
 *         product_item_id:
 *           type: integer
 *         order_item_type:
 *           type: integer
 *           description: 1 = Wishlist, 2 = Cart
 *         quantity:
 *           type: integer
 *         product_name:
 *           type: string
 *         sku_id:
 *           type: string
 *         thumbnail_image:
 *           type: string
 *         estimated_price:
 *           type: number
 */

/**
 * @swagger
 * /api/v1/user-items:
 *   post:
 *     summary: Add product to Wishlist or Cart
 *     tags: [Cart & Wishlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - product_id
 *               - product_item_id
 *               - order_item_type
 *               - product_name
 *               - sku_id
 *             properties:
 *               user_id:
 *                 type: integer
 *               product_id:
 *                 type: integer
 *               product_item_id:
 *                 type: integer
 *               order_item_type:
 *                 type: integer
 *                 example: 1
 *               quantity:
 *                 type: integer
 *                 example: 1
 *               product_name:
 *                 type: string
 *               sku_id:
 *                 type: string
 *               thumbnail_image:
 *                 type: string
 *               estimated_price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Item added successfully
 */

/**
 * @swagger
 * /api/v1/user-items:
 *   get:
 *     summary: Get Wishlist or Cart items
 *     tags: [Cart & Wishlist]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: integer
 *           description: 1 = Wishlist, 2 = Cart
 *     responses:
 *       200:
 *         description: List of items
 */

/**
 * @swagger
 * /api/v1/user-items/{id}/move:
 *   put:
 *     summary: Move item between Wishlist and Cart
 *     description: >
 *       Move an item from Wishlist to Cart or from Cart to Wishlist.
 *       Use `order_item_type = 1` for Wishlist and `order_item_type = 2` for Cart.
 *     tags: [Cart & Wishlist]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Cart/Wishlist item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_item_type
 *             properties:
 *               order_item_type:
 *                 type: integer
 *                 enum: [1, 2]
 *                 example: 2
 *                 description: |
 *                   1 = Wishlist  
 *                   2 = Cart
 *     responses:
 *       200:
 *         description: Item moved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Success
 *                 data:
 *                   type: object
 *                   properties:
 *                     item:
 *                       $ref: '#/components/schemas/CartWishlistItem'
 *       400:
 *         description: Invalid order_item_type or item already in requested state
 *       404:
 *         description: Item not found
 */


/**
 * @swagger
 * /api/v1/user-items/{id}/quantity:
 *   put:
 *     summary: Update cart item quantity
 *     description: Used when user increases or decreases quantity in cart
 *     tags: [Cart & Wishlist]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Quantity updated successfully
 */

/**
 * @swagger
 * /api/v1/user-items/{id}:
 *   delete:
 *     summary: Remove item from Wishlist or Cart
 *     tags: [Cart & Wishlist]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Item removed successfully
 */

