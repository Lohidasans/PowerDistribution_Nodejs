var express = require("express");
var router = express.Router();
const enrollmentService = require("../services/enrollmentService");

// CRUD-lite for enrollments
router.post("/enrollments", enrollmentService.createEnrollment);
router.get("/enrollments", enrollmentService.listEnrollments);
router.get("/enrollments/:id", enrollmentService.getEnrollmentById);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Enrollment
 *     description: Customer enrollments
 */

/**
 * @openapi
 * /api/v1/enrollments:
 *   get:
 *     summary: List enrollments
 *     tags: [Enrollment]
 *     parameters:
 *       - in: query
 *         name: mobile_number
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ["Active", "Inactive"] }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create enrollment
 *     tags: [Enrollment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [
 *               customer_no,
 *               customer_name,
 *               mobile_number,
 *               email,
 *               address,
 *               country_id,
 *               state_id,
 *               district_id,
 *               pincode,
 *               scheme_plan_id,
 *               installment_amount_id,
 *               identity_proof_id,
 *               identity_proof_no
 *             ]
 *             properties:
 *               customer_id: { type: integer, nullable: true }
 *               customer_no: { type: string }
 *               customer_name: { type: string }
 *               mobile_number: { type: string }
 *               email: { type: string }
 *               address: { type: string }
 *               country_id: { type: integer }
 *               state_id: { type: integer }
 *               district_id: { type: integer }
 *               pincode: { type: string }
 *               scheme_plan_id: { type: integer }
 *               installment_amount_id: { type: integer }
 *               identity_proof_id: { type: integer }
 *               identity_proof_no: { type: string }
 *               nominee: { type: string, nullable: true }
 *               nominee_relation_id: { type: integer, nullable: true }
 *               status: { type: string, enum: ["Active", "Inactive"], default: "Active" }
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/enrollments/{id}:
 *   get:
 *     summary: Get enrollment by ID
 *     tags: [Enrollment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 */
