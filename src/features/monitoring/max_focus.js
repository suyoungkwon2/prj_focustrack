import { getDailyTimeRange, fetchSessionsForDay } from './daily_metrics_utils.js';

/**
 * Calculates the maximum continuous focus duration (longest block of 'Growth' sessions)
 * within the current day (5 AM - 5 AM).
 * Assumes Firebase Admin SDK is initialized elsewhere and db is passed.
 *
 * @param {FirebaseFirestore.Firestore} db - The Firestore database instance (Admin SDK).
 * @param {string} userId - The ID of the user.
 * @returns {Promise<number>} The duration of the longest 'Growth' block in seconds. Returns 0 if no 'Growth' sessions found.
 */
export async function calculateMaxFocus(db, userId) {
    try {
        const now = Date.now();
        const { startTime, endTime } = getDailyTimeRange(now);

        // fetchSessionsForDay already sorts sessions by startTime
        const dailySessions = await fetchSessionsForDay(db, userId, startTime, endTime);

        if (dailySessions.length === 0) {
            return 0; // No sessions, so max focus is 0
        }

        let maxFocusDuration = 0;
        let currentBlockDuration = 0;
        let inGrowthBlock = false;

        console.log("Calculating Max Focus: Identifying 'Growth' blocks...");

        for (let i = 0; i < dailySessions.length; i++) {
            const session = dailySessions[i];
            const isGrowth = session.summaryCategory === 'Growth';

            if (isGrowth) {
                // Start or continue a 'Growth' block
                currentBlockDuration += (session.duration || 0);
                inGrowthBlock = true;
            } else {
                // End of a 'Growth' block (if we were in one)
                if (inGrowthBlock) {
                    console.log(` - Growth block ended. Duration: ${currentBlockDuration} seconds.`);
                    // Update max if current block is longer
                    if (currentBlockDuration > maxFocusDuration) {
                        maxFocusDuration = currentBlockDuration;
                    }
                    currentBlockDuration = 0; // Reset for the next block
                    inGrowthBlock = false;
                }
                // If not Growth, do nothing until a Growth session starts a new block
            }
        }

        // Handle the case where the sessions end while in a 'Growth' block
        if (inGrowthBlock) {
            console.log(` - Final Growth block ended. Duration: ${currentBlockDuration} seconds.`);
            if (currentBlockDuration > maxFocusDuration) {
                maxFocusDuration = currentBlockDuration;
            }
        }

        console.log("Calculation complete.");

        if (maxFocusDuration === 0) {
            console.log("No 'Growth' blocks found.");
        }

        console.log(`Calculated Max Focus Duration: ${maxFocusDuration} seconds`);
        return maxFocusDuration;

    } catch (error) {
        console.error(`Error calculating Max Focus for user ${userId}:`, error);
        return 0;
    }
}

// --- Example Usage (for testing, remove or comment out in production function) ---
/*
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./focustrack-3ba34-firebase-adminsdk-fbsvc-dc41ebc2c4.json'); 

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();
const testUserId = "750fb1af-e870-4a34-9b3e-82c9cdc5cdea"; 

calculateMaxFocus(db, testUserId)
    .then(maxTime => {
        console.log(`\n>>> Daily Max Focus Duration (seconds): ${maxTime} <<<`);
        const hours = Math.floor(maxTime / 3600);
        const minutes = Math.floor((maxTime % 3600) / 60);
        console.log(`>>> Approx: ${hours} hours and ${minutes} minutes <<<`);
    })
    .catch(err => {
        console.error("Failed to run example usage:", err);
    });
*/ 