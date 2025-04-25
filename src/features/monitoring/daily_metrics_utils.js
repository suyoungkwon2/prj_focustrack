import { getFirestore } from 'firebase-admin/firestore';

/**
 * Calculates the start and end timestamps for the "day" interval (5 AM to 5 AM next day).
 * NOTE: This now uses the SERVER'S LOCAL TIMEZONE for the 5 AM cutoff.
 * Ensure the server running this code is configured to the desired timezone (e.g., ET).
 * For robust timezone handling across environments, consider using a library like date-fns-tz or luxon.
 *
 * @param {number} currentTimestamp - The timestamp (in milliseconds) when the calculation is run.
 * @returns {{startTime: number, endTime: number}} The start and end timestamps for the daily period.
 */
export function getDailyTimeRange(currentTimestamp) {
    const now = new Date(currentTimestamp);
    const currentHour = now.getHours(); // Use local hour

    // Determine the start date based on whether the current time is before or after 5 AM local time
    let startOfDay = new Date(now);
    startOfDay.setHours(5, 0, 0, 0); // Set to 5:00:00.000 AM local time today

    if (currentHour < 5) {
        // If it's currently before 5 AM local time, the "day" started at 5 AM local time *yesterday*
        startOfDay.setDate(startOfDay.getDate() - 1); // Use setDate for local day change
    }

    // End of day is 24 hours after the start of day (5 AM local time next day)
    let endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1); // Use setDate for local day change

    const startTime = startOfDay.getTime();
    const endTime = endOfDay.getTime(); // End time is exclusive in queries usually, matches 5:00:00.000 AM next day

    // Log the calculated range in local time for clarity
    console.log(`Daily Time Range (Server Local): ${startOfDay.toLocaleString()} to ${endOfDay.toLocaleString()}`);
    return { startTime, endTime };
}

/**
 * Fetches focusSessions for a specific user within a given time range.
 * Assumes Firebase Admin SDK is initialized elsewhere and db is passed.
 *
 * @param {FirebaseFirestore.Firestore} db - The Firestore database instance (Admin SDK).
 * @param {string} userId - The ID of the user.
 * @param {number} dayStartTime - The start timestamp (milliseconds).
 * @param {number} dayEndTime - The end timestamp (milliseconds, exclusive).
 * @returns {Promise<Array>} Array of session objects within the time range.
 */
export async function fetchSessionsForDay(db, userId, dayStartTime, dayEndTime) {
    const collectionPath = `users/${userId}/focusSessions`;
    console.log(`Fetching sessions from path: ${collectionPath} between ${new Date(dayStartTime).toISOString()} and ${new Date(dayEndTime).toISOString()}`);
    const sessionsRef = db.collection(collectionPath);

    // Query for sessions within the day's time range
    const q = sessionsRef
        .where('startTime', '>=', dayStartTime)
        .where('startTime', '<', dayEndTime) // Use '<' as endTime represents the start of the next day (5:00:00 AM)
        .orderBy('startTime', 'asc'); // Order by time for easier processing later

    const snapshot = await q.get();

    if (snapshot.empty) {
        console.log('No session documents found for this user in the specified time range.');
        return [];
    }

    const sessions = [];
    snapshot.forEach(doc => {
        sessions.push({
            id: doc.id,
            ...doc.data()
        });
    });
    console.log(`Fetched ${sessions.length} sessions for the day.`);
    return sessions;
} 