import { getDailyTimeRange, fetchSessionsForDay } from './daily_metrics_utils.js';

// Categories to include for total browsing time
const BROWSING_CATEGORIES = ['Growth', 'Daily Life', 'Entertainment'];

/**
 * Calculates the total browsing time for relevant categories within the current day (5 AM - 5 AM).
 * Assumes Firebase Admin SDK is initialized elsewhere and db is passed.
 *
 * @param {FirebaseFirestore.Firestore} db - The Firestore database instance (Admin SDK).
 * @param {string} userId - The ID of the user.
 * @returns {Promise<number>} The total duration in seconds.
 */
export async function calculateTotalBrowsingTime(db, userId) {
    try {
        const now = Date.now();
        const { startTime, endTime } = getDailyTimeRange(now);

        const dailySessions = await fetchSessionsForDay(db, userId, startTime, endTime);

        if (dailySessions.length === 0) {
            return 0; // No sessions, so total time is 0
        }

        let totalDurationSeconds = 0;
        dailySessions.forEach(session => {
            // Check if the session category is one we track for browsing time
            if (BROWSING_CATEGORIES.includes(session.summaryCategory)) {
                // Add duration, handling cases where duration might be missing or null
                totalDurationSeconds += (session.duration || 0);
            }
        });

        console.log(`Calculated Total Browsing Time: ${totalDurationSeconds} seconds`);
        return totalDurationSeconds;

    } catch (error) {
        console.error(`Error calculating Total Browsing Time for user ${userId}:`, error);
        // Depending on requirements, you might return 0, null, or re-throw
        return 0;
    }
}

// --- Example Usage (for testing, remove or comment out in production function) ---
/*
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// IMPORTANT: Replace with the ACTUAL path to your service account key
const serviceAccount = require('./focustrack-3ba34-firebase-adminsdk-fbsvc-dc41ebc2c4.json'); 

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();
const testUserId = "750fb1af-e870-4a34-9b3e-82c9cdc5cdea"; // Replace with a valid User ID

calculateTotalBrowsingTime(db, testUserId)
    .then(totalTime => {
        console.log(`\n>>> Daily Total Browsing Time (seconds): ${totalTime} <<<`);
        const hours = Math.floor(totalTime / 3600);
        const minutes = Math.floor((totalTime % 3600) / 60);
        console.log(`>>> Approx: ${hours} hours and ${minutes} minutes <<<`);
    })
    .catch(err => {
        console.error("Failed to run example usage:", err);
    });
*/ 