// utils/network.js

/**
 * A utility function to delay execution for a given number of milliseconds.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>} A promise that resolves after the delay.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * A generic retry mechanism for promise-based functions.
 * It will re-attempt an operation if it fails.
 *
 * @param {Function} operation - The async function to execute.
 * @param {number} retries - The maximum number of retry attempts.
 * @param {number} delayMs - The delay in milliseconds between retries.
 * @returns {Promise<any>} The result of the successful operation.
 * @throws Will throw an error if the operation fails after all retries.
 */
export async function retry(operation, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Attempt to run the operation.
      return await operation();
    } catch (error) {
      // If this was the last attempt, re-throw the error.
      if (attempt === retries) {
        console.error(`❌ Operation failed after ${retries} attempts.`);
        throw error;
      }
      // Log the failed attempt and wait before the next one.
      console.warn(`⚠️ Attempt ${attempt} failed. Retrying in ${delayMs / 1000}s...`);
      await delay(delayMs);
    }
  }
}
