const webpush = require('web-push');
const { models } = require('../models/index');

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Save or update a browser push subscription
const savePushSubscription = async (req, res) => {
  try {
    const { endpoint, keys, user_type, user_id } = req.body;
    const { p256dh, auth } = keys || {};

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({
        statusCode: 400,
        message: 'endpoint, keys.p256dh and keys.auth are required',
      });
    }

    const [subscription, created] = await models.PushSubscription.findOrCreate({
      where: { endpoint },
      defaults: { endpoint, p256dh, auth, user_type, user_id },
    });

    if (!created) {
      await subscription.update({ p256dh, auth, user_type, user_id });
    }

    return res.status(201).json({
      statusCode: 201,
      message: 'Push subscription saved',
      data: subscription,
    });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || 'Internal server error',
    });
  }
};

// Remove a subscription when the browser unsubscribes
const deletePushSubscription = async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ statusCode: 400, message: 'endpoint is required' });
    }

    const deleted = await models.PushSubscription.destroy({ where: { endpoint } });

    if (!deleted) {
      return res.status(404).json({ statusCode: 404, message: 'Subscription not found' });
    }

    return res.status(200).json({ statusCode: 200, message: 'Push subscription removed' });
  } catch (error) {
    console.error('Error deleting push subscription:', error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || 'Internal server error',
    });
  }
};

// List all subscriptions with optional filter
const listPushSubscriptions = async (req, res) => {
  try {
    const { user_type, user_id, page = 1, limit = 10 } = req.query;
    const where = {};
    if (user_type) where.user_type = user_type;
    if (user_id) where.user_id = parseInt(user_id);

    const offset = (page - 1) * limit;
    const { rows, count } = await models.PushSubscription.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
    });

    return res.status(200).json({
      statusCode: 200,
      message: 'Push subscriptions retrieved',
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('Error listing push subscriptions:', error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || 'Internal server error',
    });
  }
};

// Send push notification to all or filtered subscribers (HTTP handler)
const sendPushNotification = async (req, res) => {
  try {
    const { title, body, icon, url, user_type, user_id } = req.body;

    if (!title || !body) {
      return res.status(400).json({ statusCode: 400, message: 'title and body are required' });
    }

    const { sent, failed } = await sendPushToSubscribers({ title, body, icon, url, user_type, user_id });

    return res.status(200).json({
      statusCode: 200,
      message: 'Push notification sent',
      sent,
      failed,
    });
  } catch (error) {
    console.error('Error sending push notification:', error);
    return res.status(500).json({
      statusCode: 500,
      message: error.message || 'Internal server error',
    });
  }
};

// Reusable helper — call this from any other service/cron job
const sendPushToSubscribers = async ({ title, body, icon, url, user_type, user_id }) => {
  const where = {};
  if (user_type) where.user_type = user_type;
  if (user_id) where.user_id = parseInt(user_id);

  const subscriptions = await models.PushSubscription.findAll({ where });
  if (!subscriptions.length) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({ title, body, icon: icon || null, url: url || '/' });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        .catch(async (err) => {
          // Clean up expired / invalid subscriptions automatically
          if (err.statusCode === 404 || err.statusCode === 410) {
            await sub.destroy();
          }
          throw err;
        })
    )
  );

  return {
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  };
};

module.exports = {
  savePushSubscription,
  deletePushSubscription,
  listPushSubscriptions,
  sendPushNotification,
  sendPushToSubscribers,
};
