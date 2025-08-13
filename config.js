import dotenv from 'dotenv';
import path from 'path';

// Set the mode based on the NODE_ENV environment variable, or default to development
const appMode = process.env.NODE_ENV || 'development';

// Only try to load .env files in development
if (appMode === 'development') {
  const envFileName = `.env.${appMode}`;
  const envPath = path.resolve(process.cwd(), envFileName);

  console.log(`Attempting to load configuration from: ${envFileName}`);
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error(`FATAL ERROR: Could not find the required configuration file: ${envFileName}`);
    console.error('For local development, ensure you have a .env.development file.');
    process.exit(1);
  } else {
    console.log(`Successfully loaded configuration from: ${envFileName}`);
  }
}

// Ensure SERVER_ID is set, as it's critical for the round-robin scheduler.
if (!process.env.SERVER_ID) {
  console.error("FATAL ERROR: SERVER_ID environment variable is not set. Please assign a unique ID to this server instance (e.g., 'server_1').");
  process.exit(1);
}

// Export all the configuration variables
export default {
  // We export the mode we are running in for potential use elsewhere
  env: appMode,
  port: process.env.PORT,
  serverId: process.env.SERVER_ID,
  earnKaroApiKey: process.env.EARN_KARO_API_KEY,
  telegram: {
    botId: process.env.TELEGRAM_BOT_ID,
    channelId: process.env.TELEGRAM_CHANNEL_ID,
  },
  facebook: {
    pageId: process.env.FACEBOOK_PAGE_ID,
    accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOCKEN,
  },
  firebase: {
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    databaseURL: process.env.FIREBASE_DB_URL,
  },
};