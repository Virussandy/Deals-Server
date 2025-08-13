// Deals-Api/firebase.js

import admin from 'firebase-admin';
import config from './config.js';
import logger from './utils/logger.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./service-account-key.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: config.firebase.storageBucket,
    databaseURL: config.firebase.databaseURL,
  });

  logger.info('Firebase Admin SDK initialized successfully using service account file.');

} catch (error) {
  logger.error('CRITICAL: Firebase initialization from service account file failed.', {
    errorMessage: error.message,
    errorStack: error.stack,
  });
  // If Firebase can't start, the app is useless. Exit immediately.
  process.exit(1);
}

export const db = admin.firestore();
export const rtdb = admin.database();
export const storage = admin.storage().bucket();
export const FieldValue = admin.firestore.FieldValue;
export default admin;