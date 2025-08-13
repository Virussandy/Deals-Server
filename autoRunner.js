import { rtdb } from './firebase.js';
import { processDeals } from './routes/deals.js';
import logger from './utils/logger.js';
import config from './config.js';

const STATE_PATH = 'scraper_state';
const CHECK_INTERVAL_MS = 15 * 1000; // Check the queue every 15 seconds
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // Job times out after 5 minutes

const stateRef = rtdb.ref(STATE_PATH);

/**
 * Registers this server in the shared list of servers if it's not already there.
 */
async function registerServer() {
    const serverListRef = stateRef.child('servers');
    try {
        const { committed, snapshot } = await serverListRef.transaction(currentServers => {
            if (currentServers === null) {
                return [config.serverId]; // Initialize the list
            }
            if (!currentServers.includes(config.serverId)) {
                currentServers.push(config.serverId);
            }
            return currentServers;
        });
        if (committed) {
            logger.info(`Server ${config.serverId} registered in the queue.`);
        } else {
            logger.info(`Server ${config.serverId} was already registered.`);
        }
    } catch (error) {
        logger.error(`Could not register server ${config.serverId}`, { error: error.message });
        process.exit(1); // Cannot run without being registered
    }
}

/**
 * The main worker loop that checks if it's this server's turn to run.
 */
async function checkForTurn() {
    try {
        const { committed, snapshot } = await stateRef.transaction(currentState => {
            // Initialize state if it doesn't exist
            if (currentState === null) {
                return {
                    is_running: false,
                    next_server_index: 0,
                    last_run_started_at: 0,
                    servers: [config.serverId] // Initial server
                };
            }

            // --- Crash Recovery ---
            // If a job is running for too long, assume it crashed and reset.
            if (currentState.is_running && (Date.now() - currentState.last_run_started_at > JOB_TIMEOUT_MS)) {
                logger.warn(`Job timed out. Resetting lock held by previous server.`);
                currentState.is_running = false;
                // We don't advance the index here, we let the scheduled server try again.
            }

            // If a job is already running, or the server list is not ready, do nothing.
            if (currentState.is_running || !currentState.servers) {
                return; // Abort transaction
            }
            
            // Ensure index is valid
            if (currentState.next_server_index >= currentState.servers.length) {
                currentState.next_server_index = 0;
            }

            // Check if it's our turn
            if (currentState.servers[currentState.next_server_index] === config.serverId) {
                // It's our turn! Take the lock.
                currentState.is_running = true;
                currentState.last_run_started_at = Date.now();
                // Move pointer to the next server for the next run
                currentState.next_server_index = (currentState.next_server_index + 1) % currentState.servers.length;
                return currentState;
            }

            // It's not our turn.
            return; // Abort transaction
        });

        if (committed) {
            // This server successfully took the turn.
            logger.info(`Server ${config.serverId} is taking its turn to scrape.`);
            await runScraper();
        } else {
            // It wasn't our turn, or a job was running. This is normal.
            logger.info(`Server ${config.serverId} is standing by.`);
        }
    } catch (error) {
        logger.error('Error in worker loop transaction', { error: error.message });
    }
}

/**
 * Executes the scraping task and then releases the lock.
 */
async function runScraper() {
    try {
        await processDeals(1); // Run the main deal processing logic
    } catch (error) {
        logger.error('Critical error during scraper execution', { error: error.stack });
    } finally {
        // Release the lock so the next server can run.
        await stateRef.child('is_running').set(false);
        logger.info(`Server ${config.serverId} has finished its task and released the lock.`);
    }
}

/**
 * Initializes the runner.
 */
async function main() {
    await registerServer();
    setInterval(checkForTurn, CHECK_INTERVAL_MS);
}

main();
