import axios from 'axios';
import FormData from 'form-data';
import { canPostToFacebook, updatePostMeta } from './facebookUtils.js';
import { retry } from './network.js';
import logger from './logger.js';
import config from '../config.js'; // Import the new config

export async function notifyChannels(deal, buffer) {
  try {
    await Promise.all([
        sendToTelegram(buffer, deal),
        sendToFacebook(buffer, deal)
    ]);

    logger.info('Sent to all channels for deal', { dealId: deal.deal_id });
  } catch (err) {
    logger.error('Failed to notify all channels for deal', { dealId: deal.deal_id, error: err.message });
  }
}

async function sendToTelegram(buffer, deal) {
  const operation = async () => {
    const form = new FormData();
    form.append('chat_id', config.telegram.channelId);
    form.append('photo', buffer, { filename: `${deal.deal_id}.jpg` });
    form.append('caption', `${deal.title}\nPrice: ${deal.price}\nStore: ${deal.store}\n${deal.redirectUrl}`);
    
    await axios.post(`https://api.telegram.org/bot${config.telegram.botId}/sendPhoto`, form, { headers: form.getHeaders() });
    logger.info('Telegram notification sent', { title: deal.title });
  };

  try {
    await retry(operation, 2, 2000);
  } catch (err) {
      logger.error('Error posting to Telegram after retries', { error: err.response?.data || err.message });
      throw err;
  }
}

async function sendToFacebook(buffer, deal) {
  if (!(await canPostToFacebook())) {
      logger.info('Skipping Facebook post due to rate limiting.');
      return;
  }

  const operation = async () => {
    const form = new FormData();
    form.append('access_token', config.facebook.accessToken);
    form.append('source', buffer, { filename: `${deal.deal_id}.jpg` });
    form.append('caption', `${deal.redirectUrl}\n${deal.price}\n${deal.title}`);

    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${config.facebook.pageId}/photos`,
      form,
      { headers: form.getHeaders() }
    );
    logger.info('Facebook post successful', { postId: response.data.post_id || response.data.id });
  };

  try {
    await retry(operation, 2, 3000);
    await updatePostMeta();
  } catch (err) {
    logger.error('Error posting to Facebook after retries', { error: err.response?.data || err.message });
    throw err;
  }
}
