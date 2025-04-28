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
  // 상세 로깅 추가: 블록 시간 범위
  console.log(`[CalcMajor][Block ${blockIndex}] Calculating for time range: ${blockStartTime.toLocaleString()} - ${blockEndTime.toLocaleString()}`);

  const categoryDurations = {
    Growth: 0,
    DailyLife: 0,
    Entertainment: 0,
  };

  // 상세 로깅 추가: 입력 세션 개수
  console.log(`[CalcMajor][Block ${blockIndex}] Processing ${sessions.length} input sessions...`);

  sessions.forEach((session, idx) => {
    const sessionStartMs = typeof session.startTime === 'number' ? session.startTime : new Date(session.startTime).getTime();
    const sessionEndMs = typeof session.endTime === 'number' ? session.endTime :
                       (session.duration ? sessionStartMs + (session.duration * 1000) : sessionStartMs);
    const category = session.summaryCategory;

    // 상세 로깅 추가: 각 세션 정보
    console.log(`[CalcMajor][Block ${blockIndex}] Session #${idx}: Cat='${category}', Start=${new Date(sessionStartMs).toLocaleTimeString()}, End=${new Date(sessionEndMs).toLocaleTimeString()}`);

    if (Object.prototype.hasOwnProperty.call(categoryDurations, category)) {
      const durationInBlock = calculateDurationInBlock(sessionStartMs, sessionEndMs, blockStartTime, blockEndTime);
      // 상세 로깅 추가: 블록 내 지속 시간 계산 결과
      console.log(`  -> Duration within block: ${(durationInBlock / 1000).toFixed(1)}s`);
      if (durationInBlock > 0) {
        categoryDurations[category] += durationInBlock;
      }
    } else {
      // 상세 로깅 추가: 관련 없는 카테고리
       console.log(`  -> Skipped: Category '${category}' is not relevant.`);
    }
  });

  // 상세 로깅 추가: 카테고리별 합산된 시간 (밀리초)
  console.log(`[CalcMajor][Block ${blockIndex}] Calculated Durations (ms): Growth=${categoryDurations.Growth}, DailyLife=${categoryDurations.DailyLife}, Entertainment=${categoryDurations.Entertainment}`);

  let majorCategory = 'N/A';
  let maxDuration = 0;

  for (const category in categoryDurations) {
    // 상세 로깅 추가: 최대 시간 비교 과정
    console.log(`  Comparing ${category} (${categoryDurations[category]}ms) with maxDuration (${maxDuration}ms)`);
    if (categoryDurations[category] > maxDuration) {
      maxDuration = categoryDurations[category];
      majorCategory = category;
      console.log(`    -> New Max: ${majorCategory} (${maxDuration}ms)`);
    }
  }

  // 최종 결과 로깅
  console.log(`[CalcMajor][Block ${blockIndex}] Final Major Category: ${majorCategory}`);
  return majorCategory;
} 