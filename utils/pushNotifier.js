const webpush = require("web-push");
const db = require("../config/dbConfig");
const { findOne } = require("../query/common");
const sendUserNotification = async (title, userId, userType, message) => {
    const vapidKeys = {
        publicKey:
            "BMQexaExnndhqLbpRUVnDOE75uRvd8-CuEa2CRmsjW6bkD9h5m6tsBvs6YQVS7lba6-T-gl4JvNU20loEWvxzSo",
        privateKey: "EIMMOj43mehuB9oR7iwDbUsyLlNmTREkGF2A_6MTv6M",
    };

    webpush.setVapidDetails(
        "mailto:lohidhasan.unitive@gmail.com",
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );

    try {
        const now = new Date().toISOString();
        const query = findOne("users", "id", userId);
        const user = userType === 1 ? await query : null;
        console.log(user?.rows[0]?.player_id, "user", user.player_id);
        if (!user?.rows[0] || !user?.rows[0]?.player_id) {
            console.warn(`No subscription found for user ${userId}`);
            return { success: false, error: "User not subscribed" };
        }

        const subscription = user?.rows[0]?.player_id;

        const payload = {
            title: `🔔 ${title}`,
            body: message,
            icon: "/logo192.png",
        };
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        console.log(`Notification sent to user ${userId}`);
        //api need to insert notification
        const notificationRes = await db.query(
            `INSERT INTO user_notifications 
   (title, user_id, message, is_read,is_deleted, created_at, updated_at) 
   VALUES ($1, $2, $3, $4, $5, $6,$7) 
   RETURNING *`,
            [title, userId, message, false, false, now, now]
        );
    } catch (err) {
        console.error("Push Error:", err);
        return { success: false, error: "Notification failed" };
    }
};

module.exports = { sendUserNotification };
