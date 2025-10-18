var express = require("express");
var subcategoryRouter = express.Router();
const subcategoryService = require("../services/subcategoryService");

subcategoryRouter.post("/subcategory", subcategoryService.createSubcategory);
subcategoryRouter.get("/subcategory", subcategoryService.getAllSubCategories);
subcategoryRouter.get(
  "/subcategory/dropdown",
  subcategoryService.listSubcategoriesDropdown
);
subcategoryRouter.get(
  "/subcategory/:id",
  subcategoryService.getSubcategoryById
);
subcategoryRouter.put("/subcategory/:id", subcategoryService.updateSubcategory);
subcategoryRouter.delete(
  "/subcategory/:id",
  subcategoryService.deleteSubcategory
);

module.exports = subcategoryRouter;

/**
 * @openapi
 * tags:
 *   - name: Subcategory
 *     description: Subcategory management
 */

/**
 * @openapi
 * /api/v1/subcategory:
 *   get:
 *     summary: List subcategories
 *     tags: [Subcategory]
 *     parameters:
 *       - in: query
 *         name: material_type
 *         schema: { type: string }
 *       - in: query
 *         name: category_name
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create subcategory
 *     tags: [Subcategory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Subcategory'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/subcategory/dropdown:
 *   get:
 *     summary: List subcategories for dropdown (id and subcategory_name only)
 *     tags: [Subcategory]
 *     parameters:
 *       - in: query
 *         name: materialType_id
 *         schema: { type: integer }
 *         description: Filter by material type ID
 *       - in: query
 *         name: category_id
 *         schema: { type: integer }
 *         description: Filter by category ID
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subcategories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       subcategory_name:
 *                         type: string
 */

/**
 * @openapi
 * /api/v1/subcategory/{id}:
 *   get:
 *     summary: Get subcategory by ID
 *     tags: [Subcategory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update subcategory
 *     tags: [Subcategory]
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
 *             $ref: '#/components/schemas/Subcategory'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete subcategory (soft)
 *     tags: [Subcategory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
