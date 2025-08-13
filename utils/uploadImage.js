import { storage } from '../firebase.js';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { retry } from './network.js'; // Import the new retry utility

/**
 * Uploads an image from a remote URL to Firebase Storage.
 */
export async function uploadImageFromUrl(imageUrl, dealId) {
  if (!imageUrl) {
      console.error('❌ Image URL is missing.');
      return null;
  }
  
  const operation = async () => {
    // Step 1: Fetch image as buffer
    const response = await fetch(imageUrl);
    if (!response.ok) {
        // Throw an error for server-side issues that might be temporary
        if (response.status >= 500) {
            throw new Error(`Failed to fetch image with status: ${response.status}`);
        }
        // For client errors (like 404), don't retry.
        console.error(`Failed to fetch image, status: ${response.status}`);
        return null;
    }
    const buffer = await response.buffer();

    // Step 2: Define file path and upload to Firebase Storage
    const fileExtension = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const filename = `deals/images/${dealId}_${uuidv4()}${fileExtension}`;
    const file = storage.file(filename);

    await file.save(buffer, {
          metadata: {
              contentType: response.headers.get('content-type') || 'image/jpeg',
              metadata: {
                  firebaseStorageDownloadTokens: uuidv4(),
              },
          },
          public: true,
          resumable: false,
      });

    // Step 3: Construct the download URL
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodeURIComponent(filename)}?alt=media`;

    console.log(`✅ Image uploaded successfully: ${downloadUrl}`);
    return {downloadUrl, buffer};
  };

  try {
    // Wrap the entire process in our retry utility.
    return await retry(operation, 3, 1500); // 3 retries, 1.5-second delay
  } catch (err) {
    console.error(`❌ Failed to upload image from URL after retries: ${imageUrl}`, err.message);
    return null;
  }
}
