var express = require("express");
var superAdminRouter = express.Router();
const superAdminService = require("../services/superAdminProfileService");

// CRUD
superAdminRouter.post(
  "/superadmin-profiles",
  superAdminService.createSuperAdminProfile
);
superAdminRouter.get(
  "/superadmin-profiles",
  superAdminService.listSuperAdminProfiles
);
superAdminRouter.get(
  "/superadmin-profiles/dropdown",
  superAdminService.listSuperAdminDropdown
);
superAdminRouter.get(
  "/superadmin-profiles/:id",
  superAdminService.getSuperAdminProfileById
);
superAdminRouter.put(
  "/superadmin-profiles/:id",
  superAdminService.updateSuperAdminProfile
);
superAdminRouter.delete(
  "/superadmin-profiles/:id",
  superAdminService.deleteSuperAdminProfile
);

module.exports = superAdminRouter;

/**
 * @openapi
 * tags:
 *   - name: SuperAdminProfile
 *     description: Super Admin Profile management
 */

/**
 * @openapi
 * /api/v1/superadmin-profiles:
 *   get:
 *     summary: List Super Admin Profiles
 *     tags: [SuperAdminProfile]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create Super Admin Profile with optional bank account, KYC docs, and multiple logins
 *     tags: [SuperAdminProfile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SuperAdminFullCreateInput'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/superadmin-profiles/dropdown:
 *   get:
 *     summary: List Super Admin Profiles for dropdown (id and company_name only)
 *     tags: [SuperAdminProfile]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 superadmin_profiles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       company_name:
 *                         type: string
 */

/**
 * @openapi
 * /api/v1/superadmin-profiles/{id}:
 *   get:
 *     summary: Get Super Admin Profile by ID
 *     tags: [SuperAdminProfile]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update Super Admin Profile with optional updates for bank account, KYC docs, and multiple logins (update-only; KYC/logins require id)
 *     tags: [SuperAdminProfile]
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
 *             $ref: '#/components/schemas/SuperAdminFullUpdateInput'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete Super Admin Profile (soft delete)
 *     tags: [SuperAdminProfile]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
