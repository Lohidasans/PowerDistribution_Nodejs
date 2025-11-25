const express = require('express');
const router = express.Router();
const svc = require('../services/oldJewelService');

router.post('/old-jewels', svc.createOldJewel);
router.post('/old-jewels/code', svc.generateOldJewelCode);
router.get('/old-jewels', svc.getAllOldJewels);
router.get('/old-jewels/dropdown', svc.listOldJewelDropdown);
router.get('/old-jewels/:id', svc.getOldJewelById);
router.put('/old-jewels/:id', svc.updateOldJewel);
router.delete('/old-jewels/:id', svc.deleteOldJewel);


module.exports = router;

/**
 * @swagger
 * tags:
 *   name: OldJewels
 *   description: Old Jewel Management
 */

/**
 * @swagger
 * /api/old-jewels:
 *   post:
 *     summary: Create a new old jewel record
 *     tags: [OldJewels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jewel_name
 *               - weight
 *               - weight_unit
 *               - purity
 *               - current_value
 *             properties:
 *               jewel_name:
 *                 type: string
 *               jewel_description:
 *                 type: string
 *               weight:
 *                 type: number
 *                 format: float
 *               weight_unit:
 *                 type: string
 *                 enum: [grams, kg, pounds]
 *               purity:
 *                 type: string
 *                 enum: [14K, 18K, 22K, 24K, Other]
 *               current_value:
 *                 type: number
 *                 format: float
 *               purchase_date:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *                 enum: [in_stock, sold, melted, lost, other]
 *               notes:
 *                 type: string
 *               image_url:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               branch_id:
 *                 type: integer
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_type:
 *                       type: string
 *                     metal_type:
 *                       type: string
 *                     weight:
 *                       type: number
 *                       format: float
 *                     purity:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                     description:
 *                       type: string
 *                     estimated_value:
 *                       type: number
 *                       format: float
 *                     image_url:
 *                       type: string
 *     responses:
 *       201:
 *         description: Old jewel record created successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */


/**
 * @swagger
 * /api/old-jewels:
 *   get:
 *     summary: Get all old jewel records with pagination
 *     tags: [OldJewels]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for jewel name or description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [in_stock, sold, melted, lost, other]
 *         description: Filter by status
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: integer
 *         description: Filter by branch ID
 *     responses:
 *       200:
 *         description: List of old jewel records
 *       500:
 *         description: Server error
 */


/**
 * @swagger
 * /api/old-jewels/{id}:
 *   get:
 *     summary: Get a single old jewel record by ID
 *     tags: [OldJewels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Old jewel record ID
 *     responses:
 *       200:
 *         description: Old jewel record details
 *       404:
 *         description: Old jewel record not found
 *       500:
 *         description: Server error
 */


/**
 * @swagger
 * /api/old-jewels/{id}:
 *   put:
 *     summary: Update an old jewel record
 *     tags: [OldJewels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Old jewel record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OldJewel'
 *     responses:
 *       200:
 *         description: Old jewel record updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Old jewel record not found
 *       500:
 *         description: Server error
 */


/**
 * @swagger
 * /api/old-jewels/{id}:
 *   delete:
 *     summary: Delete an old jewel record (soft delete)
 *     tags: [OldJewels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Old jewel record ID
 *     responses:
 *       204:
 *         description: Old jewel record deleted successfully
 *       404:
 *         description: Old jewel record not found
 *       500:
 *         description: Server error
 */

