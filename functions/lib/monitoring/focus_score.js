// Removed Firebase Admin SDK initialization and service account import

// Allowed categories for focus metric calculation
const ALLOWED_CATEGORIES = ['Growth', 'Daily Life', 'Entertainment'];

// Fetch and filter sessions for a specific user from Firebase
async function fetchUserSessions(db, userId) {
    try {
        const collectionPath = `users/${userId}/focusSessions`;
        console.log(`Fetching sessions from path: ${collectionPath}...`);
        
        const sessionsRef = db.collection(collectionPath);
        const snapshot = await sessionsRef.get();
        
        if (snapshot.empty) {
            console.log('No matching session documents found for this user.');
            return [];
        }
        
        const allSessions = [];
        snapshot.forEach(doc => {
            allSessions.push({
                id: doc.id,
                ...doc.data()
            });
        });
        console.log(`Fetched ${allSessions.length} total sessions.`);

        // Filter sessions by allowed categories
        const filteredSessions = allSessions.filter(session => 
            ALLOWED_CATEGORIES.includes(session.summaryCategory)
        );
        console.log(`Filtered down to ${filteredSessions.length} sessions in allowed categories.`);

        // Sort the filtered sessions by startTime (oldest first)
        const sortedSessions = filteredSessions.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

        return sortedSessions;
    } catch (error) {
        console.error(`Error fetching sessions for user ${userId}:`, error);
        throw error;
    }
}

// Phase 2: Data Processing Functions (Variables  )

/**
 * Calculates Switch Frequency (SF) based on category changes between adjacent sessions.
 * @param {Array} sessions - Array of session objects, sorted chronologically (oldest first).
 * @returns {number} The total number of category switches between adjacent sessions.
 */
function calculateSwitchFrequency(sessions) {
    // Need at least 2 sessions to compare
    if (sessions.length < 2) {
        console.log(`--- Calculating SF: Not enough sessions for comparison (${sessions.length} sessions) ---`);
        return 0;
    }

    console.log(`--- Calculating SF: Comparing categories of adjacent sessions ---`);
    let switchCount = 0;
    for (let i = 0; i < sessions.length - 1; i++) {
        const currentCategory = sessions[i].summaryCategory;
        const nextCategory = sessions[i + 1].summaryCategory;

        // Check if categories exist and are different
        if (currentCategory && nextCategory && currentCategory !== nextCategory) {
            switchCount++;
            console.log(`  SF Switch ${switchCount}: ${currentCategory} (Session ID ${sessions[i].id}) -> ${nextCategory} (Session ID ${sessions[i + 1].id})`);
        } else {
            // Optional: Log when no switch occurs for debugging
            // console.log(`No switch between session ${sessions[i].id} (${currentCategory}) and ${sessions[i+1].id} (${nextCategory})`);
        }
    }
    console.log("---------------------------------------------------------------");
    return switchCount;
}

/**
 * Calculates Continuous Focus Duration (CFD) for the 'Growth' category.
 * Finds blocks of consecutive 'Growth' sessions and calculates their average duration.
 * @param {Array} sessions - Array of filtered, sorted session objects.
 * @returns {number} The average duration (in seconds) of continuous 'Growth' blocks. Returns 0 if no 'Growth' blocks found.
 */
function calculateCFD(sessions) {
    const growthBlocksDurations = [];
    let currentBlockDuration = 0;
    let currentBlockSessions = []; // To store sessions of the current block
    let inGrowthBlock = false;
    let firstBlockLogged = false; // Flag to ensure we only log the first block

    console.log("--- Calculating CFD: Identifying 'Growth' blocks ---");

    for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        const isGrowth = session.summaryCategory === 'Growth';

        if (isGrowth) {
            // Start or continue a 'Growth' block
            currentBlockDuration += (session.duration || 0);
            currentBlockSessions.push({ // Store relevant details
                id: session.id,
                category: session.summaryCategory,
                duration: (session.duration || 0)
            });
            inGrowthBlock = true;
        } else {
            // End of a 'Growth' block (if we were in one)
            if (inGrowthBlock) {
                console.log(`Growth block ended. Duration: ${currentBlockDuration} seconds.`);
                growthBlocksDurations.push(currentBlockDuration);

                // Log details only for the *first* block encountered
                if (!firstBlockLogged) {
                    console.log("--- Details of the First Growth Block ---");
                    currentBlockSessions.forEach((s, index) => {
                        console.log(`  Session ${index + 1}: ID=${s.id}, Category=${s.category}, Duration=${s.duration}s`);
                    });
                    console.log("----------------------------------------");
                    firstBlockLogged = true; // Mark as logged
                }

                currentBlockDuration = 0; // Reset for the next block
                currentBlockSessions = [];  // Clear sessions for the next block
                inGrowthBlock = false;
            }
            // If not Growth, do nothing until a Growth session starts a new block
        }
    }

    // Handle the case where the sessions end while in a 'Growth' block
    if (inGrowthBlock) {
        console.log(`Final Growth block ended. Duration: ${currentBlockDuration} seconds.`);
        growthBlocksDurations.push(currentBlockDuration);
        
        // Log details if the first block is also the final block
        if (!firstBlockLogged) {
            console.log("--- Details of the First (and Final) Growth Block ---");
            currentBlockSessions.forEach((s, index) => {
                console.log(`  Session ${index + 1}: ID=${s.id}, Category=${s.category}, Duration=${s.duration}s`);
            });
            console.log("----------------------------------------");
        }
    }

    console.log("---------------------------------------------------");

    if (growthBlocksDurations.length === 0) {
        console.log("No 'Growth' blocks found.");
        return 0; // No 'Growth' blocks found
    }

    // Calculate the average duration
    const totalGrowthDuration = growthBlocksDurations.reduce((sum, duration) => sum + duration, 0);
    const averageCFD = totalGrowthDuration / growthBlocksDurations.length;
    
    console.log(`Total Growth blocks: ${growthBlocksDurations.length}, Total duration: ${totalGrowthDuration}, Average CFD: ${averageCFD.toFixed(2)}`);

    return averageCFD;
}

/**
 * Calculates the Work-to-Leisure Ratio (WLR).
 * Ratio of total duration spent on 'Growth' vs ('Entertainment' + 'Daily Life').
 * @param {Array} sessions - Array of filtered, sorted session objects.
 * @returns {number} The WLR (Growth duration / Leisure duration). Returns Infinity if Leisure duration is 0 but Growth is > 0. Returns 0 if Growth duration is 0.
 */
function calculateWLR(sessions) {
    let totalGrowthDuration = 0;
    let totalLeisureDuration = 0; // Combined Entertainment + Daily Life

    console.log("--- Calculating WLR: Summing durations for Growth vs (Entertainment + Daily Life) ---");

    sessions.forEach(session => {
        const duration = session.duration || 0;
        if (session.summaryCategory === 'Growth') {
            totalGrowthDuration += duration;
        } else if (session.summaryCategory === 'Entertainment' || session.summaryCategory === 'Daily Life') {
            totalLeisureDuration += duration;
        }
        // Any other categories are ignored
    });

    console.log(`Total Growth Duration: ${totalGrowthDuration}s`);
    console.log(`Total Leisure Duration (Entertainment + Daily Life): ${totalLeisureDuration}s`);
    console.log("----------------------------------------------------------------------------");

    if (totalLeisureDuration === 0) {
        // Handle division by zero: If Growth is positive, ratio is infinite. If Growth is also zero, ratio is 0.
        return totalGrowthDuration > 0 ? Infinity : 0;
    }

    const wlr = totalGrowthDuration / totalLeisureDuration;
    return wlr;
}

// --- Phase 3: Focus Score Calculation ---

/**
 * Normalizes and combines the individual metrics into a final Focus Score.
 * @param {number} sf - Switch Frequency (raw value).
 * @param {number} cfd - Continuous Focus Duration (raw value, seconds).
 * @param {number} wlr - Work-to-Leisure Ratio (raw value).
 * @returns {number} The final Focus Score (0-1 range).
 */
function calculateFocusScore(sf, cfd, wlr) {
    console.log("--- Calculating Final Focus Score ---");

    // 1. Normalize SF (Lower is better, target 0, cap at 8)
    const normalizedSF = Math.max(0, 1 - (sf / 8));
    console.log(`  Raw SF: ${sf}, Normalized SF: ${normalizedSF.toFixed(2)}`);

    // 2. Normalize CFD (Higher is better, target 3000s/50min, cap at 1)
    const normalizedCFD = Math.min(1, cfd / 3000);
    console.log(`  Raw CFD: ${cfd.toFixed(2)}s, Normalized CFD: ${normalizedCFD.toFixed(2)}`);

    // 3. Normalize WLR (Higher is better, target 5.0, cap at 1)
    // Handle WLR = Infinity case separately
    const effectiveWLR = (wlr === Infinity) ? 5.0 : wlr;
    const normalizedWLR = Math.min(1, effectiveWLR / 5);
    console.log(`  Raw WLR: ${wlr === Infinity ? "Infinity" : wlr.toFixed(2)}, Normalized WLR: ${normalizedWLR.toFixed(2)}`);

    // 4. Apply weights and calculate final score
    const focusScore = (normalizedSF * 0.2) + (normalizedCFD * 0.4) + (normalizedWLR * 0.4);
    console.log(`  Weighted Score: (SF ${normalizedSF.toFixed(2)} * 0.2) + (CFD ${normalizedCFD.toFixed(2)} * 0.4) + (WLR ${normalizedWLR.toFixed(2)} * 0.4)`);
    console.log("-------------------------------------");

    return focusScore;
}

// --- Main Exported Function ---
/**
 * Fetches user sessions for the last 2 hours, calculates SF, CFD, WLR,
 * and the final Focus Score. Logs the process and returns the score.
 *
 * @param {FirebaseFirestore.Firestore} db - The initialized Firestore database instance.
 * @param {string} userId - The ID of the user for whom to calculate the score.
 * @returns {Promise<number|null>} The calculated focus score (0-1 range), or null if no sessions found.
 */
export async function calculateAndLogFocusScore(db, userId) {
    try {
        // --- Define Time Window ---
        const currentTime = Date.now(); // Use the actual current time
        const twoHoursInMillis = 120 * 60 * 1000; // Changed from 30 to 120 minutes
        const windowEndTime = currentTime;
        const windowStartTime = windowEndTime - twoHoursInMillis;

        const windowEndTimeFormatted = new Date(windowEndTime).toLocaleString();
        const windowStartTimeFormatted = new Date(windowStartTime).toLocaleString();
        console.log(`Calculating Focus Score for user ${userId} in window: ${windowStartTimeFormatted} to ${windowEndTimeFormatted} (last 2 hours)`);
        // --------------------------

        // Phase 1: Fetch Data (all sessions for user)
        // Pass db and userId to fetchUserSessions
        const allFetchedSessions = await fetchUserSessions(db, userId);
        console.log(`Fetched ${allFetchedSessions.length} total sessions for user ${userId}.`);

        // Filter sessions to only include those within the defined 2-hour window
        const sessionsInWindow = allFetchedSessions.filter(s =>
            s.startTime >= windowStartTime && s.startTime < windowEndTime
        );
        console.log(`Found ${sessionsInWindow.length} sessions within the last 2 hours.`);

        // Proceed only if there are sessions in the window
        if (sessionsInWindow.length > 0) {
            console.log("Sample session data (first in window):", JSON.stringify(sessionsInWindow[0], null, 2));

            // --- Log relevant fields for all processed sessions in the window ---
            console.log("--- Processed Session Data in Window (ID, StartTime, Duration, Category) ---");
            sessionsInWindow.forEach(s => {
                console.log(`ID: ${s.id}, Start: ${s.startTime}, Duration: ${s.duration || 0}s, Category: ${s.summaryCategory}`);
            });
            console.log("--------------------------------------------------------------------");
            // ----------------------------------------------------

            // Phase 2: Calculate Components using only sessions in the window
            const switchFrequency = calculateSwitchFrequency(sessionsInWindow);
            console.log("Calculated Switch Frequency (SF):", switchFrequency);

            const continuousFocusDuration = calculateCFD(sessionsInWindow);
            console.log("Calculated Continuous Focus Duration (CFD - average seconds):", continuousFocusDuration.toFixed(2));

            const workLeisureRatio = calculateWLR(sessionsInWindow);
            console.log("Calculated Work-to-Leisure Ratio (WLR - Growth / (Entertainment + Daily Life)):", workLeisureRatio === Infinity ? "Infinity" : workLeisureRatio.toFixed(2));

            // Phase 3: Calculate Final Score
            const focusScore = calculateFocusScore(switchFrequency, continuousFocusDuration, workLeisureRatio);
            console.log(`>>> Final Focus Score for User ${userId}: ${(focusScore * 100).toFixed(1)}% <<<`);
            return focusScore; // Return the calculated score

        } else {
            console.log(`No sessions found for user ${userId} in the last 2 hours. No metrics calculated.`);
            return null; // Return null if no sessions found
        }
    } catch (error) {
        console.error(`Failed to calculate focus score for user ${userId}:`, error);
        throw error; // Re-throw the error for handling by the caller
    }
}
