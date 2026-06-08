var express = require('express');
var pushNotificationRouter = express.Router();
const pushNotificationService = require('../services/pushNotificationService');

// Return VAPID public key — frontend needs this to subscribe
pushNotificationRouter.get('/push-notification/vapid-public-key', (req, res) => {
  res.status(200).json({
    statusCode: 200,
    publicKey: process.env.VAPID_PUBLIC_KEY,
  });
});

// Save / refresh a browser push subscription
pushNotificationRouter.post('/push-notification/subscribe', pushNotificationService.savePushSubscription);

// Remove a subscription (browser unsubscribed)
pushNotificationRouter.delete('/push-notification/unsubscribe', pushNotificationService.deletePushSubscription);

// List all stored subscriptions
pushNotificationRouter.get('/push-notification/subscriptions', pushNotificationService.listPushSubscriptions);

// Trigger a push notification (admin / internal)
pushNotificationRouter.post('/push-notification/send', pushNotificationService.sendPushNotification);

module.exports = pushNotificationRouter;

/**
 * @openapi
 * tags:
 *   - name: Push Notifications
 *     description: Web Push Notification management
 */

/**
 * @openapi
 * /api/v1/push-notification/vapid-public-key:
 *   get:
 *     summary: Get VAPID public key for browser subscription
 *     tags: [Push Notifications]
 *     responses:
 *       200:
 *         description: VAPID public key
 */

/**
 * @openapi
 * /api/v1/push-notification/subscribe:
 *   post:
 *     summary: Save a push subscription from the browser
 *     tags: [Push Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *               - keys
 *             properties:
 *               endpoint:
 *                 type: string
 *               keys:
 *                 type: object
 *                 required:
 *                   - p256dh
 *                   - auth
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
 *               user_type:
 *                 type: string
 *                 enum: [customer, employee, admin]
 *               user_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Subscription saved
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */

/**
 * @openapi
 * /api/v1/push-notification/unsubscribe:
 *   delete:
 *     summary: Remove a push subscription
 *     tags: [Push Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *             properties:
 *               endpoint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription removed
 *       404:
 *         description: Subscription not found
 */

/**
 * @openapi
 * /api/v1/push-notification/subscriptions:
 *   get:
 *     summary: List push subscriptions
 *     tags: [Push Notifications]
 *     parameters:
 *       - in: query
 *         name: user_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
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
 *     responses:
 *       200:
 *         description: Subscriptions retrieved
 */

/**
 * @openapi
 * /api/v1/push-notification/send:
 *   post:
 *     summary: Send a push notification to subscribers
 *     tags: [Push Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - body
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               icon:
 *                 type: string
 *               url:
 *                 type: string
 *               user_type:
 *                 type: string
 *                 description: Filter by user type (omit to send to all)
 *               user_id:
 *                 type: integer
 *                 description: Filter by specific user (omit to send to all)
 *     responses:
 *       200:
 *         description: Notification sent
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
