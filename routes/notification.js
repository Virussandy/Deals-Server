import express from 'express';
import admin from '../firebase.js';
import logger from '../utils/logger.js'; // Import the new logger

const router = express.Router();

router.post('/', async (req, res) => {
  const { title, body, imageUrl, data } = req.body;

  const message = {
    notification: {
      title,
      body,
      imageUrl: imageUrl || undefined,
    },
    android: {
      priority: 'high',
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
    },
    data: data || {},
    topic: 'all',
  };

  try {
    const response = await admin.messaging().send(message);
    logger.info('FCM notification sent successfully', { fcmResponse: response });

    if (data?.deal_id) {
      const notificationEntry = {
        deal_id: data.deal_id,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      };
      await admin.database().ref(`Notifications/${data.deal_id}`).set(notificationEntry);
      logger.info('Notification entry saved to Realtime DB', { dealId: data.deal_id });
    }

    res.status(200).json({ success: true, fcmResponse: response });
  } catch (error) {
    logger.error('Error sending FCM notification:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
