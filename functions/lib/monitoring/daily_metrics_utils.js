import { DateTime } from 'luxon';

const TARGET_TIMEZONE = 'America/New_York';

/**
 * Calculates the start and end timestamps for the "day" interval relevant to the current time.
 * Start time is 5 AM ET of the current cycle day.
 * End time is the current execution timestamp.
 * Uses luxon for robust timezone handling.
 *
 * @param {number} currentTimestamp - The timestamp (in milliseconds) when the calculation is run.
 * @returns {{startTime: number, endTime: number}} The start and end timestamps for the daily period up to now.
 */
export function getDailyTimeRange(currentTimestamp) {
    const nowET = DateTime.fromMillis(currentTimestamp, { zone: TARGET_TIMEZONE });

    // Determine the start date (5 AM ET)
    let startOfDayET = nowET.set({ hour: 5, minute: 0, second: 0, millisecond: 0 });

    // If current time is before 5 AM ET, the cycle started yesterday
    if (nowET.hour < 5) {
        startOfDayET = startOfDayET.minus({ days: 1 });
    }

    const startTime = startOfDayET.toMillis();
    const endTime = currentTimestamp; // End time is the moment the function is called

    console.log(`Daily Time Range (ET): ${startOfDayET.toISO()} to ${nowET.toISO()}`);
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