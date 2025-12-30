var express = require("express");
var maintenanceRouter = express.Router();
const maintenanceService = require("../services/maintenanceService");

maintenanceRouter.post("/maintenance", maintenanceService.createMaintenance);
maintenanceRouter.get("/maintenance", maintenanceService.listMaintenances);
maintenanceRouter.get("/maintenance/:id", maintenanceService.getMaintenanceById);
maintenanceRouter.put("/maintenance/:id", maintenanceService.updateMaintenance);
maintenanceRouter.delete("/maintenance/:id", maintenanceService.deleteMaintenance);
maintenanceRouter.get("/maintenance/performance-options", maintenanceService.getMachinePerformanceOptions);

module.exports = maintenanceRouter;

/**
 * @openapi
 * tags:
 *   - name: Maintenance
 *     description: Maintenance management
 */

/**
 * @openapi
 * /api/v1/maintenance:
 *   post:
 *     summary: Create a new maintenance record
 *     tags: [Maintenance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - maintenance_type_id
 *               - technician_name
 *               - machine_performance
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Date of maintenance
 *               maintenance_type_id:
 *                 type: integer
 *                 description: ID of the maintenance type
 *               technician_name:
 *                 type: string
 *                 description: Name of the technician
 *               machine_performance:
 *                 type: string
 *                 enum: ["Good", "Fair", "Poor", "Needs Attention"]
 *                 description: Performance status of the machine
 *               remarks:
 *                 type: string
 *                 description: Additional remarks
 *               status:
 *                 type: string
 *                 enum: ["Scheduled", "In Progress", "Completed", "Cancelled"]
 *                 default: "Scheduled"
 *                 description: Status of the maintenance
 *     responses:
 *       201:
 *         description: Maintenance record created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Maintenance'
 *   get:
 *     summary: Get all maintenance records
 *     tags: [Maintenance]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter by technician name or remarks
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ["Scheduled", "In Progress", "Completed", "Cancelled"]
 *         description: Filter by status
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date (inclusive)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date (inclusive)
 *       - in: query
 *         name: maintenance_type_id
 *         schema:
 *           type: integer
 *         description: Filter by maintenance type ID
 *     responses:
 *       200:
 *         description: List of maintenance records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 maintenances:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Maintenance'
 */

/**
 * @openapi
 * /api/v1/maintenance/{id}:
 *   get:
 *     summary: Get a maintenance record by ID
 *     tags: [Maintenance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Maintenance record ID
 *     responses:
 *       200:
 *         description: Maintenance record details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 maintenance:
 *                   $ref: '#/components/schemas/Maintenance'
 *   put:
 *     summary: Update a maintenance record
 *     tags: [Maintenance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Maintenance record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Date of maintenance
 *               maintenance_type_id:
 *                 type: integer
 *                 description: ID of the maintenance type
 *               technician_name:
 *                 type: string
 *                 description: Name of the technician
 *               machine_performance:
 *                 type: string
 *                 enum: ["Good", "Fair", "Poor", "Needs Attention"]
 *                 description: Performance status of the machine
 *               remarks:
 *                 type: string
 *                 description: Additional remarks
 *               status:
 *                 type: string
 *                 enum: ["Scheduled", "In Progress", "Completed", "Cancelled"]
 *                 description: Status of the maintenance
 *     responses:
 *       200:
 *         description: Maintenance record updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 maintenance:
 *                   $ref: '#/components/schemas/Maintenance'
 *   delete:
 *     summary: Delete a maintenance record
 *     tags: [Maintenance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Maintenance record ID
 *     responses:
 *       204:
 *         description: Maintenance record deleted successfully
 */

/**
 * @openapi
 * /api/v1/maintenance/status-options:
 *   get:
 *     summary: Get all possible maintenance status options
 *     tags: [Maintenance]
 *     responses:
 *       200:
 *         description: List of status options
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusOptions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Scheduled", "In Progress", "Completed", "Cancelled"]
 */

/**
 * @openapi
 * /api/v1/maintenance/performance-options:
 *   get:
 *     summary: Get all possible machine performance options
 *     tags: [Maintenance]
 *     responses:
 *       200:
 *         description: List of performance options
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 performanceOptions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Good", "Fair", "Poor", "Needs Attention"]
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Maintenance:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           readOnly: true
 *         date:
 *           type: string
 *           format: date
 *         maintenance_type_id:
 *           type: integer
 *         maintenance_type:
 *           $ref: '#/components/schemas/MaintenanceType'
 *         technician_name:
 *           type: string
 *         machine_performance:
 *           type: string
 *           enum: ["Good", "Fair", "Poor", "Needs Attention"]
 *         remarks:
 *           type: string
 *         status:
 *           type: string
 *           enum: ["Scheduled", "In Progress", "Completed", "Cancelled"]
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     MaintenanceType:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         type_name:
 *           type: string
 */
