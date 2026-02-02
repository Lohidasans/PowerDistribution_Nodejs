var express = require("express");
var deviceInfoRouter = express.Router();
const deviceInfoService = require("../services/deviceInfoService");

deviceInfoRouter.post("/device-info", deviceInfoService.createDeviceInfo);
deviceInfoRouter.get("/device-info", deviceInfoService.listDeviceInfos);
deviceInfoRouter.get("/device-info/dropdown", deviceInfoService.deviceInfoDropdownList);
deviceInfoRouter.get("/device-info/:id", deviceInfoService.getDeviceInfoById);
deviceInfoRouter.put("/device-info/:id", deviceInfoService.updateDeviceInfo);
deviceInfoRouter.delete("/device-info/:id", deviceInfoService.deleteDeviceInfo);

module.exports = deviceInfoRouter;

/**
 * @openapi
 * tags:
 *   - name: Device Info
 *     description: Device information management
 */

/**
 * @openapi
 * /api/v1/device-info:
 *   post:
 *     summary: Create a new device info
 *     tags: [Device Info]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - device_name
 *               - branch_id
 *             properties:
 *               device_name:
 *                 type: string
 *               mac_address:
 *                 type: string
 *               devices:
 *                 type: string
 *               ip_address:
 *                 type: string
 *               branch_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Device info created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 *   get:
 *     summary: List all device infos
 *     tags: [Device Info]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Device infos retrieved successfully
 *       500:
 *         description: Internal server error
 */

/**
 * @openapi
 * /api/v1/device-info/dropdown:
 *   get:
 *     summary: Get device infos dropdown list
 *     tags: [Device Info]
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Device infos dropdown retrieved successfully
 *       500:
 *         description: Internal server error
 */

/**
 * @openapi
 * /api/v1/device-info/{id}:
 *   get:
 *     summary: Get device info by ID
 *     tags: [Device Info]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Device info retrieved successfully
 *       404:
 *         description: Device info not found
 *       500:
 *         description: Internal server error
 *   put:
 *     summary: Update device info
 *     tags: [Device Info]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               device_name:
 *                 type: string
 *               mac_address:
 *                 type: string
 *               devices:
 *                 type: string
 *               ip_address:
 *                 type: string
 *               branch_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Device info updated successfully
 *       404:
 *         description: Device info not found
 *       500:
 *         description: Internal server error
 *   delete:
 *     summary: Delete device info
 *     tags: [Device Info]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Device info deleted successfully
 *       404:
 *         description: Device info not found
 *       500:
 *         description: Internal server error
 */
