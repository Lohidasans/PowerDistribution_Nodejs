var express = require("express");
var offerApplicableTypeRouter = express.Router();
const offerApplicableTypeService = require("../services/offerApplicableTypeService");

offerApplicableTypeRouter.post("/offer-applicable-types", offerApplicableTypeService.createOfferApplicableType);
offerApplicableTypeRouter.get("/offer-applicable-types", offerApplicableTypeService.listOfferApplicableTypes);
offerApplicableTypeRouter.get("/offer-applicable-types/dropdown", offerApplicableTypeService.listApplicableTypesDropdown);
offerApplicableTypeRouter.get("/offer-applicable-types/:id", offerApplicableTypeService.getOfferApplicableTypeById);
offerApplicableTypeRouter.put("/offer-applicable-types/:id", offerApplicableTypeService.updateOfferApplicableType);
offerApplicableTypeRouter.delete("/offer-applicable-types/:id", offerApplicableTypeService.deleteOfferApplicableType);


module.exports = offerApplicableTypeRouter;

/**
 * @openapi
 * tags:
 *   - name: OfferApplicableType
 *     description: Offer Applicable Type management
 */

/**
 * @openapi
 * /api/v1/offer-applicable-types:
 *   post:
 *     summary: Create a new applicable type
 *     tags: [OfferApplicableType]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type_name
 *             properties:
 *               type_name:
 *                 type: string
 *                 description: Name of the applicable type
 *     responses:
 *       201:
 *         description: Applicable type created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OfferApplicableType'
 *   get:
 *     summary: Get all applicable types
 *     tags: [OfferApplicableType]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter applicable types by name
 *     responses:
 *       200:
 *         description: List of applicable types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applicableTypes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OfferApplicableType'
 */

/**
 * @openapi
 * /api/v1/offer-applicable-types/{id}:
 *   get:
 *     summary: Get an applicable type by ID
 *     tags: [OfferApplicableType]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Applicable type ID
 *     responses:
 *       200:
 *         description: Applicable type details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applicableType:
 *                   $ref: '#/components/schemas/OfferApplicableType'
 *   put:
 *     summary: Update an applicable type
 *     tags: [OfferApplicableType]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Applicable type ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type_name:
 *                 type: string
 *                 description: New name for the applicable type
 *     responses:
 *       200:
 *         description: Applicable type updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applicableType:
 *                   $ref: '#/components/schemas/OfferApplicableType'
 *   delete:
 *     summary: Delete an applicable type
 *     tags: [OfferApplicableType]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Applicable type ID
 *     responses:
 *       204:
 *         description: Applicable type deleted successfully
 */

/**
 * @openapi
 * /api/v1/offer-applicable-types/dropdown:
 *   get:
 *     summary: Get applicable types for dropdown
 *     tags: [OfferApplicableType]
 *     responses:
 *       200:
 *         description: List of applicable types for dropdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applicableTypes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OfferApplicableTypeDropdown'
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     OfferApplicableType:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           readOnly: true
 *         type_name:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     OfferApplicableTypeDropdown:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         type_name:
 *           type: string
 */
