var express = require("express");
var router = express.Router();
const svc = require("../services/countryService");

// CRUD
router.post("/country", svc.createCountry);
router.get("/country", svc.getAllCountries);
router.get("/country/dropdown", svc.listCountriesDropdown); 
router.get("/country/:id", svc.getCountryById);
router.put("/country/:id", svc.updateCountry); 
router.delete("/country/:id", svc.deleteCountry); 

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Country
 *     description: Country Master management
 */

/**
 * @openapi
 * /api/v1/country:
 *   get:
 *     summary: List all countries
 *     tags: [Country]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by country name
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create a new country
 *     tags: [Country]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Country'
 *     responses:
 *       201:
 *         description: Country created successfully
 */

/**
 * @openapi
 * /api/v1/country/{id}:
 *   get:
 *     summary: Get country by ID
 *     tags: [Country]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update country by ID
 *     tags: [Country]
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
 *             $ref: '#/components/schemas/Country'
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete country (soft delete)
 *     tags: [Country]
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
 * /api/v1/country/dropdown:
 *   get:
 *     summary: List countries for dropdown
 *     tags: [Country]
 *     responses:
 *       200:
 *         description: OK
 */
