export const MINUTES_PER_BLOCK = 10;
export const BLOCKS_PER_HOUR = 60 / MINUTES_PER_BLOCK; // 6
export const BLOCKS_PER_DAY = 24 * BLOCKS_PER_HOUR; // 144
const DAY_START_HOUR = 5; // Day starts at 5 AM

/**
 * Calculates the start of the 'day' (5 AM) for a given date.
 * @param {Date} date - The reference date.
 * @returns {Date} A new Date object representing 5 AM on that day.
 */
function getStartOfDay(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(DAY_START_HOUR, 0, 0, 0); // Set to 5:00:00:000
  // If the original time was before 5 AM, the start of the 'day' is 5 AM of the *previous* calendar day.
  if (date.getHours() < DAY_START_HOUR) {
    startOfDay.setDate(startOfDay.getDate() - 1);
  }
  return startOfDay;
}

/**
 * Calculates the 10-minute block index (0-143) for a given timestamp,
 * relative to the 5 AM start of the day.
 * @param {number|Date} timestamp - The timestamp (milliseconds since epoch or Date object).
 * @returns {number} The block index (0-143).
 */
export function get10MinBlockIndex(timestamp) {
  const date = new Date(timestamp);
  const startOfDay = getStartOfDay(date);
  const diffMinutes = (date.getTime() - startOfDay.getTime()) / (1000 * 60);
  
  // Ensure the index stays within 0-143 range, handling potential edge cases.
  const index = Math.max(0, Math.min(BLOCKS_PER_DAY - 1, Math.floor(diffMinutes / MINUTES_PER_BLOCK)));
  return index;
}

/**
 * Calculates the time range (start and end Date objects) for a given block index.
 * @param {number} blockIndex - The block index (0-143).
 * @param {Date} referenceDate - The date to determine which day the block belongs to (defaults to now).
 * @returns {{blockStartTime: Date, blockEndTime: Date}} The start and end times for the block.
 */
export function get10MinBlockTimeRange(blockIndex, referenceDate = new Date()) {
  const startOfDay = getStartOfDay(referenceDate);
  const blockStartTime = new Date(startOfDay.getTime() + blockIndex * MINUTES_PER_BLOCK * 60 * 1000);
  const blockEndTime = new Date(blockStartTime.getTime() + MINUTES_PER_BLOCK * 60 * 1000);
  return { blockStartTime, blockEndTime };
}

/**
 * Calculates the duration (in milliseconds) that a session overlaps with a given time block.
 * @param {number} sessionStartTimeMs - Session start time (milliseconds since epoch).
 * @param {number} sessionEndTimeMs - Session end time (milliseconds since epoch).
 * @param {Date} blockStartTime - Block start time (Date object).
 * @param {Date} blockEndTime - Block end time (Date object).
 * @returns {number} Overlapping duration in milliseconds.
 */
function calculateDurationInBlock(sessionStartTimeMs, sessionEndTimeMs, blockStartTime, blockEndTime) {
  const blockStartMs = blockStartTime.getTime();
  const blockEndMs = blockEndTime.getTime();

  // Calculate the effective start and end times within the block
  const effectiveStart = Math.max(sessionStartTimeMs, blockStartMs);
  const effectiveEnd = Math.min(sessionEndTimeMs, blockEndMs);

  // Return the duration if there is an overlap, otherwise 0
  return Math.max(0, effectiveEnd - effectiveStart);
}

/**
 * Calculates the major category for a specific 10-minute block based on session data.
 * @param {number} blockIndex - The index of the block (0-143).
 * @param {Array<object>} sessions - Array of session objects for the relevant day.
 *                                  Each session should have `startTime`, `endTime` (as ms timestamps),
 *                                  and `summaryCategory`.
 * @param {Date} referenceDate - The date for which to calculate the block (defaults to now).
 * @returns {string} The major category ('Growth', 'DailyLife', 'Entertainment', or 'N/A').
 */
export function calculateMajorCategoryForBlock(blockIndex, sessions, referenceDate = new Date()) {
  if (!sessions || sessions.length === 0) {
    return 'N/A';
  }

  const { blockStartTime, blockEndTime } = get10MinBlockTimeRange(blockIndex, referenceDate);
  
  const categoryDurations = {
    Growth: 0,
    DailyLife: 0,
    Entertainment: 0,
    // N/A or other categories are implicitly handled (duration ignored)
  };

  sessions.forEach(session => {
    // Ensure session times are numerical timestamps
    const sessionStartMs = typeof session.startTime === 'number' ? session.startTime : new Date(session.startTime).getTime();
    // Use endTime if available, otherwise estimate based on duration (assuming duration is in seconds)
    const sessionEndMs = typeof session.endTime === 'number' ? session.endTime :
                       (session.duration ? sessionStartMs + (session.duration * 1000) : sessionStartMs); // Fallback to start time if no end/duration

    const category = session.summaryCategory;

    // Only consider relevant categories
    if (Object.prototype.hasOwnProperty.call(categoryDurations, category)) {
      const durationInBlock = calculateDurationInBlock(sessionStartMs, sessionEndMs, blockStartTime, blockEndTime);
      if (durationInBlock > 0) {
        categoryDurations[category] += durationInBlock;
      }
    }
  });

  let majorCategory = 'N/A';
  let maxDuration = 0;

  for (const category in categoryDurations) {
    if (categoryDurations[category] > maxDuration) {
      maxDuration = categoryDurations[category];
      majorCategory = category;
    }
  }

  // Optional: Log the calculated durations for debugging
  // console.log(`[Block ${blockIndex}] Durations: Growth=${(categoryDurations.Growth/1000).toFixed(1)}s, DailyLife=${(categoryDurations.DailyLife/1000).toFixed(1)}s, Entertainment=${(categoryDurations.Entertainment/1000).toFixed(1)}s -> Major: ${majorCategory}`);

  return majorCategory;
} 