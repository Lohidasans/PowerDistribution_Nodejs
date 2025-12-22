var express = require("express");
var materialTypeRouter = express.Router();
const materialTypeService = require("../services/materialTypeService");

materialTypeRouter.post("/material-type",  materialTypeService.createMaterialType);
materialTypeRouter.get("/material-type", materialTypeService.listMaterialTypes);
materialTypeRouter.get("/material-type/dropdown", materialTypeService.listMaterialTypesDropdown);
materialTypeRouter.get("/material-type/:id", materialTypeService.getMaterialTypeById);
materialTypeRouter.put("/material-type/bulk", materialTypeService.updateMaterialTypesBulk);
materialTypeRouter.put("/material-type/:id", materialTypeService.updateMaterialType);
materialTypeRouter.delete("/material-type/:id", materialTypeService.deleteMaterialType);

module.exports = materialTypeRouter;

/**
 * @openapi
 * tags:
 *   - name: MaterialType
 *     description: Material Type management
 */

/**
 * @openapi
 * /api/v1/material-type:
 *   get:
 *     summary: List material types
 *     tags: [MaterialType]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create material type
 *     tags: [MaterialType]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MaterialType'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/material-type/dropdown:
 *   get:
 *     summary: List material types for dropdown (id and material_type only)
 *     tags: [MaterialType]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 materialTypes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       material_type:
 *                         type: string
 */
/**
 * @openapi
 * /api/v1/material-type/{id}:
 *   get:
 *     summary: Get material type by ID
 *     tags: [MaterialType]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update material type
 *     tags: [MaterialType]
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
 *             $ref: '#/components/schemas/MaterialType'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete material type (soft)
 *     tags: [MaterialType]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
