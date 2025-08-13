import axios from 'axios';
import dayjs from 'dayjs';
import { db, FieldValue } from '../firebase.js';
import logger from './logger.js';
import config from '../config.js'; // Import the new config

const MIN_POST_GAP_MINUTES = 15;

export async function canPostToFacebook() {
  const metaRef = db.collection('meta').doc('fb_post_status');
  const doc = await metaRef.get();

  const now = dayjs();

  if (!doc.exists) {
    await metaRef.set({ lastPostAt: now.toISOString(), count: 1 });
    return true;
  }

  const data = doc.data();
  const lastPost = dayjs(data.lastPostAt);

  if (now.diff(lastPost, 'minute') >= MIN_POST_GAP_MINUTES) {
    return true;
  }

  logger.warn('Facebook post skipped due to rate limiting.', { 
      minutesSinceLastPost: now.diff(lastPost, 'minute') 
  });
  return false;
}

export async function updatePostMeta() {
  const metaRef = db.collection('meta').doc('fb_post_status');
  await metaRef.update({
    lastPostAt: new Date().toISOString(),
    count: FieldValue.increment(1),
  });
}

export async function getAllFacebookPostIds(limit = 100) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${config.facebook.pageId}/posts`,
      {
        params: {
          access_token: config.facebook.accessToken,
          limit,
        },
      }
    );

    const posts = response.data?.data || [];
    const postIds = posts.map(post => post.id);
    logger.info(`Found ${postIds.length} Facebook post(s).`);
    return postIds;
  } catch (err) {
    logger.error('Failed to fetch Facebook posts', { error: err.response?.data || err.message });
    return [];
  }
}

export async function deleteFacebookPost(postId) {
  try {
    await axios.delete(
      `https://graph.facebook.com/v18.0/${postId}`,
      {
        params: {
          access_token: config.facebook.accessToken,
        },
      }
    );
    logger.info(`Deleted Facebook post: ${postId}`);
    return true;
  } catch (err) {
    logger.error(`Failed to delete Facebook post ${postId}`, { error: err.response?.data || err.message });
    return false;
  }
}
