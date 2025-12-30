var express = require("express");
var offerRouter = express.Router();
const offerService = require("../services/offerService");

// Create a new offer
offerRouter.post("/offers", offerService.createOffer);
offerRouter.get("/offers", offerService.listOffers);
offerRouter.get("/offers/dropdown", offerService.listOffersDropdown);
offerRouter.get("/offers/:id", offerService.getOfferById);
offerRouter.put("/offers/:id", offerService.updateOffer);
offerRouter.delete("/offers/:id", offerService.deleteOffer);
offerRouter.post("/offers/code", offerService.generateOfferCode);
module.exports = offerRouter;

/**
 * @openapi
 * tags:
 *   - name: Offer
 *     description: Offer management
 */

/**
 * @openapi
 * /api/v1/offers:
 *   post:
 *     summary: Create a new offer
 *     tags: [Offer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - offer_code
 *               - offer_plan_id
 *               - offer_type
 *               - offer_value
 *               - valid_from
 *               - valid_to
 *               - applicable_type_id
 *             properties:
 *               offer_code:
 *                 type: string
 *                 description: Unique code for the offer
 *               offer_plan_id:
 *                 type: integer
 *                 description: ID of the offer plan
 *               offer_description:
 *                 type: string
 *                 description: Description of the offer
 *               offer_type:
 *                 type: string
 *                 enum: ["Percentage", "Amount"]
 *                 description: Type of the offer
 *               offer_value:
 *                 type: number
 *                 format: decimal
 *                 description: Value of the offer
 *               valid_from:
 *                 type: string
 *                 format: date
 *                 description: Start date of the offer validity
 *               valid_to:
 *                 type: string
 *                 format: date
 *                 description: End date of the offer validity
 *               applicable_type_id:
 *                 type: integer
 *                 description: ID of the applicable type
 *               status:
 *                 type: string
 *                 enum: ["Active", "Inactive"]
 *                 default: "Active"
 *     responses:
 *       201:
 *         description: Offer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Offer'
 *   get:
 *     summary: Get all offers
 *     tags: [Offer]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter offers by code or description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ["Active", "Inactive"]
 *         description: Filter offers by status
 *     responses:
 *       200:
 *         description: List of offers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Offer'
 */

/**
 * @openapi
 * /api/v1/offers/{id}:
 *   get:
 *     summary: Get an offer by ID
 *     tags: [Offer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer ID
 *     responses:
 *       200:
 *         description: Offer details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offer:
 *                   $ref: '#/components/schemas/Offer'
 *   put:
 *     summary: Update an offer
 *     tags: [Offer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Offer'
 *     responses:
 *       200:
 *         description: Offer updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offer:
 *                   $ref: '#/components/schemas/Offer'
 *   delete:
 *     summary: Delete an offer
 *     tags: [Offer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer ID
 *     responses:
 *       200:
 *         description: Offer deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Offer deleted successfully"
 */

/**
 * @openapi
 * /api/v1/offers/dropdown:
 *   get:
 *     summary: Get offers for dropdown/list selection
 *     tags: [Offer]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ["Active", "Inactive"]
 *         description: Filter offers by status (default: Active)
 *     responses:
 *       200:
 *         description: List of offers for dropdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OfferDropdown'
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Offer:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           readOnly: true
 *         offer_code:
 *           type: string
 *         offer_plan_id:
 *           type: integer
 *         offer_description:
 *           type: string
 *         offer_type:
 *           type: string
 *           enum: ["Percentage", "Amount"]
 *         offer_value:
 *           type: number
 *           format: decimal
 *         valid_from:
 *           type: string
 *           format: date
 *         valid_to:
 *           type: string
 *           format: date
 *         applicable_type_id:
 *           type: integer
 *         status:
 *           type: string
 *           enum: ["Active", "Inactive"]
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     OfferDropdown:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         offer_code:
 *           type: string
 *         offer_plan_id:
 *           type: integer
 *         offer_type:
 *           type: string
 *         offer_value:
 *           type: number
 *         valid_from:
 *           type: string
 *           format: date
 *         valid_to:
 *           type: string
 *           format: date
 *         applicable_type_id:
 *           type: integer
 *         status:
 *           type: string
 */
