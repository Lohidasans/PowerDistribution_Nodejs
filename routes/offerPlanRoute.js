var express = require("express");
var offerPlanRouter = express.Router();
const offerPlanService = require("../services/offerPlanService");

offerPlanRouter.post("/offer-plans", offerPlanService.createOfferPlan);
offerPlanRouter.get("/offer-plans", offerPlanService.listOfferPlans);
offerPlanRouter.get("/offer-plans/dropdown", offerPlanService.listOfferPlansDropdown);
offerPlanRouter.get("/offer-plans/:id", offerPlanService.getOfferPlanById);
offerPlanRouter.put("/offer-plans/:id", offerPlanService.updateOfferPlan);
offerPlanRouter.delete("/offer-plans/:id", offerPlanService.deleteOfferPlan);

module.exports = offerPlanRouter;

/**
 * @openapi
 * tags:
 *   - name: OfferPlan
 *     description: Offer Plan management
 */

/**
 * @openapi
 * /api/v1/offer-plans:
 *   post:
 *     summary: Create a new offer plan
 *     tags: [OfferPlan]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan_name
 *             properties:
 *               plan_name:
 *                 type: string
 *                 description: Name of the offer plan
 *     responses:
 *       201:
 *         description: Offer plan created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OfferPlan'
 *   get:
 *     summary: Get all offer plans
 *     tags: [OfferPlan]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter offer plans by name
 *     responses:
 *       200:
 *         description: List of offer plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offerPlans:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OfferPlan'
 */

/**
 * @openapi
 * /api/v1/offer-plans/{id}:
 *   get:
 *     summary: Get an offer plan by ID
 *     tags: [OfferPlan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer plan ID
 *     responses:
 *       200:
 *         description: Offer plan details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offerPlan:
 *                   $ref: '#/components/schemas/OfferPlan'
 *   put:
 *     summary: Update an offer plan
 *     tags: [OfferPlan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan_name:
 *                 type: string
 *                 description: New name for the offer plan
 *     responses:
 *       200:
 *         description: Offer plan updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offerPlan:
 *                   $ref: '#/components/schemas/OfferPlan'
 *   delete:
 *     summary: Delete an offer plan
 *     tags: [OfferPlan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer plan ID
 *     responses:
 *       204:
 *         description: Offer plan deleted successfully
 */

/**
 * @openapi
 * /api/v1/offer-plans/dropdown:
 *   get:
 *     summary: Get offer plans for dropdown
 *     tags: [OfferPlan]
 *     responses:
 *       200:
 *         description: List of offer plans for dropdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offerPlans:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OfferPlanDropdown'
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     OfferPlan:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           readOnly: true
 *         plan_name:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     OfferPlanDropdown:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         plan_name:
 *           type: string
 */
