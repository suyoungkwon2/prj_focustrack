const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

//미셸:
//Add ALL required monitoring functions
const { calculateAndLogFocusScore } = require("./lib/monitoring/focus_score.js");
const { calculateAverageFocus } = require("./lib/monitoring/average_focus.js");
const { calculateMaxFocus } = require("./lib/monitoring/max_focus.js");
const { calculateTotalBrowsingTime } = require("./lib/monitoring/total_browsing_time.js");

//멜:
// v2 Firestore 트리거 import 추가
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
// 파라미터화된 설정 import 추가
const { defineString } = require("firebase-functions/params");
// Gemini API 키 파라미터 정의
const geminiApiKeyParam = defineString("GEMINI_API_KEY");

// V2 스케줄러 import 추가
const { onSchedule } = require("firebase-functions/v2/scheduler"); 

admin.initializeApp();
// 추가된 로그: 초기화 확인 및 프로젝트 ID 로깅 (내용 약간 수정)
console.log("Firebase Admin SDK initialized (v2 check).");
try {
  console.log(`Admin SDK Project ID: ${admin.app().options.projectId}`);
} catch (e) {
  console.error("Error getting Admin SDK project ID:", e);
}

const db = admin.firestore(); // Firestore 인스턴스


// 멜 추가된 로그: Firestore 인스턴스 확인
if (db) {
  console.log("Firestore instance obtained successfully.");
  // --- 삭제: 초기화 직후 users 컬렉션 읽기 테스트 제거 ---
  /*
  db.collection("users").limit(1).get()
    .then(snapshot => {
      console.log(`[Index.js Test Read] Successfully attempted to read 'users'. Found ${snapshot.docs.length} documents (limit 1).`);
    })
    .catch(err => {
      console.error("[Index.js Test Read] Error reading 'users' collection immediately after init:", err);
    });
  */
  // --- 테스트 코드 끝 ---
} else {
  console.error("Failed to obtain Firestore instance!");
}

// --- 상수 정의 ---
const GROWTH_SESSION_THRESHOLD = 15; // 분류를 시작할 Growth 세션 개수 임계값 (30 -> 15로 수정)

// --- Google AI 설정 (지연 초기화 방식으로 수정) ---
let genAI;
let classificationModel;
let summarizationModel;

function initializeGeminiClient() {
  // 이미 초기화되었으면 반환
  if (genAI && classificationModel && summarizationModel) {
    return true;
  }
  try {
    const googleApiKey = geminiApiKeyParam.value();
    if (!googleApiKey) {
      console.error("FATAL ERROR: Gemini API Key (GEMINI_API_KEY parameter) is not set at runtime.");
      return false; // 초기화 실패
    }
    genAI = new GoogleGenerativeAI(googleApiKey);
    classificationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    summarizationModel = genAI.getGenerativeAI(googleApiKey);
    console.log("GoogleGenerativeAI initialized successfully at runtime.");
    return true; // 초기화 성공
  } catch (error) {
    console.error("Error initializing GoogleGenerativeAI at runtime:", error);
    return false; // 초기화 실패
  }
}

// Digital Routine 함수 import
const { processTenMinuteBlocks, aggregateDailyDurations } = require("./digitalRoutineFunctions");

// 멜:v2 구문으로 변경
// --- Firestore 트리거 함수  ---
exports.onFocusSessionCreate = onDocumentCreated("users/{userId}/focusSessions/{sessionId}", async (event) => {
    // event 객체에서 데이터와 파라미터 가져오기
    const snap = event.data; // onCreate의 경우 event.data는 DocumentSnapshot
    if (!snap) {
      console.error("Event data is missing. Cannot process function.");
      return;
    }
    const sessionData = snap.data(); // 생성된 문서 데이터
    const userId = event.params.userId;
    const sessionId = event.params.sessionId; // sessionId도 params에서 가져옴


//미셸:
    //(충돌로 주석 처리) const sessionId = context.params.sessionId; // Keep sessionId for logging if needed


    // 1. 'Growth' 카테고리인지 확인
    if (!sessionData || sessionData.summaryCategory !== "Growth") { // sessionData null 체크 추가
      functions.logger.log(`User ${userId}, Session ${sessionId}: Not a 'Growth' session or session data invalid. Skipping.`);
      return null; // 'Growth' 아니거나 데이터 없으면 함수 종료
    }

    functions.logger.log(`User ${userId}, Session ${sessionId}: 'Growth' session detected. Processing counter.`);

    // 2. 카운터 처리 (트랜잭션 사용)
    const counterRef = db.collection("userGrowthCounters").doc(userId);
    let shouldProcessClassification = false;

    try {
      await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let newCount = 1;

        if (counterDoc.exists) {
          const currentCount = counterDoc.data().count || 0;
          if (currentCount < (GROWTH_SESSION_THRESHOLD - 1)) {
            newCount = currentCount + 1;
            transaction.update(counterRef, { count: newCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
             functions.logger.log(`User ${userId}: Counter incremented to ${newCount}.`);
          } else { // Counter reached the threshold
            newCount = 0; // Reset counter
            shouldProcessClassification = true; // Mark for processing
            transaction.set(counterRef, { count: newCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); // Reset counter
             functions.logger.log(`User ${userId}: Counter reached ${GROWTH_SESSION_THRESHOLD}. Resetting to 0 and triggering classification.`);
          }
        } else {
          // 문서가 없으면 새로 생성
          transaction.set(counterRef, { count: newCount, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
           functions.logger.log(`User ${userId}: Counter document created with count ${newCount}.`);
        }
      });

      // 3. 분류 프로세스 시작 (트랜잭션 성공 후)
      if (shouldProcessClassification) {
        functions.logger.log(`User ${userId}: Starting classification process asynchronously.`);
        // 함수를 직접 호출 (비동기적으로 실행됨)
        // 오류 처리를 위해 try-catch 사용 고려
        try {
            await processClassification(userId);
        } catch (procError) {
            functions.logger.error(`User ${userId}: Error during processClassification call:`, procError);
            // 여기서 에러 알림 등 추가 처리 가능
        }
      }

    } catch (error) {
      functions.logger.error(`User ${userId}: Transaction failed for counter update:`, error);
      // 트랜잭션 실패 시 처리 (예: 재시도 로직은 복잡해질 수 있음)
    }

    return null; // 함수 정상 종료 (트리거 자체는 성공)
  });

//20250426 미셸 Monitoring feature 스케줄 추가 (시작)
// Scheduled function for Focus Score Calculation (수정: v2 onSchedule 사용)
exports.calculateFocusScoreScheduled = onSchedule({
  region: "us-central1", // 또는 원하는 리전
  schedule: 'every 30 minutes from 5:00 to 4:59',
  timeZone: 'Asia/Seoul'
}, async (event) => { // context -> event 로 변경
      functions.logger.log('Starting scheduled focus score calculation for all users.');
      try {
          // 멜 수정: users 컬렉션 대신 users_list 사용
          const usersSnapshot = await db.collection('users_list').get(); 
          const userIds = usersSnapshot.docs.map(doc => doc.id);

          if (userIds.length === 0) {
              functions.logger.log('No users found to process for focus score.');
              return null;
          }
          functions.logger.log(`Found ${userIds.length} users for focus score calculation.`);

          // 2. Process score for each user
          const promises = userIds.map(userId => processFocusScoreForUser(userId));
          await Promise.all(promises);

          functions.logger.log('Finished scheduled focus score calculation for all users.');

      } catch (error) {
          functions.logger.error('Error during scheduled focus score calculation:', error);
      }
      return null;
  });

// Helper function to process focus score for a single user
async function processFocusScoreForUser(userId) {
    functions.logger.log(`Calculating focus score for user ${userId}...`);
    try {
        // 1. Calculate the score using the imported function
        // NOTE: calculateAndLogFocusScore already handles the 2-hour window internally
        const scoreResult = await calculateAndLogFocusScore(db, userId); // db is the admin.firestore() instance

        // 2. Determine the correct date string (YYYY-MM-DD) for the 5 AM cycle
        const now = new Date();
        const today5AM = new Date(now);
        today5AM.setHours(5, 0, 0, 0);
        if (now < today5AM) { // If run before 5 AM, it belongs to the previous day's cycle
            today5AM.setDate(today5AM.getDate() - 1);
        }
        const dateString = today5AM.toISOString().split('T')[0];

        // 3. Save/Overwrite the score (if calculated) in the daily log document
        const logRef = db.collection(`users/${userId}/dailylog`).doc(dateString);

        if (scoreResult !== null) {
            const scoreData = {
                latestFocusScore: {
                    score: scoreResult, // The score returned from calculateAndLogFocusScore
                    calculatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                date: admin.firestore.Timestamp.fromDate(today5AM) // Store the date for reference
            };
            await logRef.set(scoreData, { merge: true }); // Use merge: true
            functions.logger.log(`User ${userId}: Saved focus score ${scoreResult.toFixed(4)} for date ${dateString}.`);
        } else {
            // Optionally, save a 'null' score or a status indicating no sessions
             const noScoreData = {
                latestFocusScore: {
                    score: null,
                    message: "No sessions found in the calculation window.",
                    calculatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                 date: admin.firestore.Timestamp.fromDate(today5AM)
            };
            await logRef.set(noScoreData, { merge: true });
            functions.logger.log(`User ${userId}: No sessions found to calculate focus score for date ${dateString}. Saved null score.`);
        }

    } catch (error) {
        functions.logger.error(`User ${userId}: Failed to process focus score:`, error);
        // Consider saving an error state to the logRef as well
         try {
            const now = new Date();
            const today5AM = new Date(now);
            today5AM.setHours(5, 0, 0, 0);
             if (now < today5AM) { today5AM.setDate(today5AM.getDate() - 1); }
            const dateString = today5AM.toISOString().split('T')[0];
            const logRef = db.collection(`users/${userId}/dailylog`).doc(dateString);
            const errorData = {
                latestFocusScore: {
                    score: null,
                    error: error.message || "Calculation failed",
                    calculatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                date: admin.firestore.Timestamp.fromDate(today5AM)
            };
             await logRef.set(errorData, { merge: true });
         } catch (saveError) {
             functions.logger.error(`User ${userId}: Also failed to save error state for focus score:`, saveError);
         }
    }
}


// Scheduled function for Daily Metrics (수정: v2 onSchedule 사용)
// Updated schedule to run every 30 mins starting at 5 AM
exports.calculateDailyMetricsScheduled = onSchedule({
  region: "us-central1", // 또는 원하는 리전
  schedule: 'every 30 minutes from 5:00 to 4:59',
  timeZone: 'Asia/Seoul'
}, async (event) => { // context -> event 로 변경
    functions.logger.log('Starting scheduled daily metrics calculation for all users.');
    try {
        // 멜 수정: users 컬렉션 대신 users_list 사용
        const usersSnapshot = await db.collection('users_list').get(); 
        const userIds = usersSnapshot.docs.map(doc => doc.id);

        if (userIds.length === 0) {
            functions.logger.log('No users found to process for daily metrics.');
            return null;
        }
        functions.logger.log(`Found ${userIds.length} users for daily metrics calculation.`);

        // 2. Process metrics for each user
        const promises = userIds.map(userId => processDailyMetricsForUser(userId));
        await Promise.all(promises);

        functions.logger.log('Finished scheduled daily metrics calculation for all users.');

    } catch (error) {
        functions.logger.error('Error during scheduled daily metrics calculation:', error);
    }
    return null;
  });

// Helper function to process daily metrics for a single user (수정됨)
async function processDailyMetricsForUser(userId) {
    functions.logger.log(`Calculating daily metrics for user ${userId}...`);
    let dateString;
    try {
        // 멜 수정: 각 계산 함수 호출 시 db 인스턴스를 첫 번째 인자로 전달
        const averageFocus = await calculateAverageFocus(db, userId);
        // 멜 수정: 각 계산 함수 호출 시 db 인스턴스를 첫 번째 인자로 전달
        const maxFocus = await calculateMaxFocus(db, userId);
        // 멜 수정: 각 계산 함수 호출 시 db 인스턴스를 첫 번째 인자로 전달
        const totalBrowsingTime = await calculateTotalBrowsingTime(db, userId);

        const now = new Date();
        const today5AM = new Date(now);
        today5AM.setHours(5, 0, 0, 0);
        if (now < today5AM) { today5AM.setDate(today5AM.getDate() - 1); }
        dateString = today5AM.toISOString().split('T')[0];
        const dailyMetricData = {
            dailyMetrics: {
                averageContinuousFocusSeconds: averageFocus,
                maxContinuousFocusSeconds: maxFocus,
                totalBrowsingSeconds: totalBrowsingTime,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            date: admin.firestore.Timestamp.fromDate(today5AM)
        };
        const logRef = db.collection(`users/${userId}/dailylog`).doc(dateString);
        await logRef.set(dailyMetricData, { merge: true });
        functions.logger.log(`User ${userId}: Saved daily metrics (AvgFocus: ${averageFocus.toFixed(0)}s, MaxFocus: ${maxFocus}s, TotalBrowse: ${totalBrowsingTime}s) for date ${dateString}.`);
    } catch (error) {
        const logDateString = dateString || 'unknown-date-error-occurred-early';
        functions.logger.error(`User ${userId}: Failed to process daily metrics for date ${logDateString}:`, error);
         try {
             let errorDateString = dateString;
             let errorDate = null;
             if (!errorDateString) {
                 const now = new Date();
                 const today5AM = new Date(now);
                 today5AM.setHours(5, 0, 0, 0);
                 if (now < today5AM) { today5AM.setDate(today5AM.getDate() - 1); }
                 errorDateString = today5AM.toISOString().split('T')[0];
                 errorDate = today5AM;
             }
             const logRef = db.collection(`users/${userId}/dailylog`).doc(errorDateString);
             const errorData = {
                 dailyMetrics: { error: error.message || "Calculation failed", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
                 ...(errorDate && { date: admin.firestore.Timestamp.fromDate(errorDate) })
             };
             await logRef.set(errorData, { merge: true });
             functions.logger.log(`User ${userId}: Saved error state for daily metrics on date ${errorDateString}.`);
         } catch (saveError) {
            const finalDateString = dateString || 'unknown-date-error-occurred-early';
            functions.logger.error(`User ${userId}: Also failed to save error state for daily metrics on date ${finalDateString}:`, saveError);
         }
    }
}

//20250426 미셸 Monitoring feature 스케줄 추가 (끝)

// --- 분류 및 요약 처리 함수 ---
async function processClassification(userId) {
  // Gemini 클라이언트 초기화 확인 및 시도
  if (!initializeGeminiClient()) {
    functions.logger.error(`User ${userId}: Failed to initialize Google AI SDK. Cannot proceed with classification.`);
    return;
  }
  functions.logger.log(`User ${userId}: processClassification started.`);

  // 1. 데이터 가져오기 (최신 Growth 5개로 수정)
  const sessions = await getGrowthSessionsData(userId, 5);
  if (!sessions || sessions.length < 1) { // 최소 개수 정책 필요 시 추가 (예: sessions.length < 5)
    functions.logger.log(`User ${userId}: Not enough sessions fetched (${sessions.length}) for classification.`);
    return;
  }

  // 2. 1단계: 세션 분류
  const classifiedIdGroups = await classifySessions(sessions);
  if (!classifiedIdGroups || classifiedIdGroups.length === 0) {
    functions.logger.log(`User ${userId}: Classification step failed or returned no groups.`);
    return;
  }
  functions.logger.log(`User ${userId}: Classification Result (Groups of IDs):`, classifiedIdGroups);


  // 3. 2단계: 그룹별 요약 및 시간 계산
  const finalResults = [];
  functions.logger.log(`User ${userId}: Processing ${classifiedIdGroups.length} groups for summarization...`);

  for (const groupIds of classifiedIdGroups) {
    const summary = await summarizeGroup(groupIds, sessions);
    if (summary) {
      const totalDuration = calculateTotalDuration(groupIds, sessions);
      finalResults.push({
        classifiedTopic: summary.classifiedTopic,
        classifiedSummary: summary.classifiedSummary,
        classifiedKeywords: summary.classifiedKeywords,
        totalDuration: totalDuration,
        sessionIds: groupIds
      });
    } else {
       functions.logger.warn(`User ${userId}: Skipping group [${groupIds.join(', ')}] due to summarization error.`);
    }
  }

  // 4. 결과 정렬 및 필터링 (상위 6개)
  functions.logger.log(`User ${userId}: Total ${finalResults.length} groups summarized.`);
  finalResults.sort((a, b) => b.totalDuration - a.totalDuration);
  const topResults = finalResults.slice(0, 6);

  // 5. 최종 결과 저장 (users/{userId}/classed 컬렉션에 단일 문서로)
   if (topResults.length > 0) {
    const classedCollectionRef = db.collection(`users/${userId}/classed`);
    const batchDocId = generateTimestampedId(classedCollectionRef); // Generate custom ID

    // 결과를 단일 객체로 구성
    const classificationBatchResult = {
        results: topResults, // Array of individual group results
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    functions.logger.log(`User ${userId}: Storing classification batch result with ID: ${batchDocId}`);

    try {
        // batch 대신 단일 문서 set 사용
        await classedCollectionRef.doc(batchDocId).set(classificationBatchResult);
        functions.logger.log(`User ${userId}: Successfully stored classification batch result.`);
    } catch(error) {
        functions.logger.error(`User ${userId}: Error storing classification batch result:`, error);
    }
  } else {
     functions.logger.log(`User ${userId}: No final results to store.`);
  }

   functions.logger.log(`User ${userId}: processClassification finished.`);
}

// Helper function to generate timestamped document ID
function generateTimestampedId(collectionRef) {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2); // YY
    const month = String(now.getMonth() + 1).padStart(2, '0'); // MM (01-12)
    const day = String(now.getDate()).padStart(2, '0'); // DD
    const hours = String(now.getHours()).padStart(2, '0'); // HH (00-23)
    const minutes = String(now.getMinutes()).padStart(2, '0'); // mm

    const timestampPrefix = `${year}${month}${day}${hours}${minutes}`;
    const autoId = collectionRef.doc().id; // Generate a Firestore auto-ID

    return `${timestampPrefix}-${autoId}`;
}

// --- Helper Functions (Adapted from test script) ---

// 데이터 가져오기 (Cloud Function 버전)
async function getGrowthSessionsData(userId, count) {
  functions.logger.log(`User ${userId}: Fetching latest ${count} 'Growth' sessions...`);
  const sessions = [];
  try {
    const q = admin.firestore() // admin.firestore() 사용
      .collection(`users/${userId}/focusSessions`)
      .where("summaryCategory", "==", "Growth")
      .orderBy("endTime", "desc")
      .limit(count);
    const querySnapshot = await q.get(); // getDocs 대신 get 사용
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const sessionId = data.id || doc.id;
      sessions.push({
        id: sessionId,
        firebaseId: doc.id,
        summaryTopic: data.summaryTopic || "",
        summaryPoints: data.summaryPoints || [],
        duration: data.duration || 0,
        url: data.url || "",
        title: data.title || "",
      });
    });
    functions.logger.log(`User ${userId}: Successfully fetched ${sessions.length} sessions for classification.`);
  } catch (error) {
    functions.logger.error(`User ${userId}: Error fetching Firestore data for classification:`, error);
  }
  return sessions;
}
// 세션 분류 (Cloud Function 버전)
async function classifySessions(sessionsToClassify) {
   // Gemini 클라이언트 초기화 확인 및 시도
   if (!initializeGeminiClient()) {
     functions.logger.error("Failed to initialize Google AI SDK. Cannot proceed with classification.");
     return [];
   }
   functions.logger.log(`Classifying ${sessionsToClassify.length} sessions...`);
   if (!sessionsToClassify || sessionsToClassify.length === 0) return [];

   const classificationInput = sessionsToClassify.map(s => ({ id: s.id, summaryTopic: s.summaryTopic, duration: s.duration }));
   const prompt = `다음 사용자 세션 목록을 'summaryTopic'의 의미론적 유사성을 기반으로 그룹화해주세요. 'duration'이 긴 세션의 내용에 더 높은 가중치를 부여하여 그룹화해주세요. 결과는 각 그룹에 속하는 세션 'id'들의 리스트 목록으로 반환해주세요. 반드시 유효한 JSON 배열 형식으로만 응답해주세요. 예: [["id1", "id5", "id12"], ["id2", "id8"], ["id3", "id10", "id25"]]

세션 목록:
${JSON.stringify(classificationInput, null, 2)}

JSON 결과:`;

   try {
     const result = await classificationModel.generateContent(
         { contents: [{ role: "user", parts: [{ text: prompt }] }],
           generationConfig: { temperature: 0.2 }
         });
     const response = await result.response;
     const text = response.text();
     functions.logger.info("Raw classification response:", text);

     const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```|(\[\[[\s\S]*?\]\])/);
     let jsonString = text.trim();
     if (jsonMatch) jsonString = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[2].trim();

     const classifiedGroups = JSON.parse(jsonString);
     if (!Array.isArray(classifiedGroups) || !classifiedGroups.every(Array.isArray)) throw new Error("Invalid format");
     functions.logger.log(`Successfully classified into ${classifiedGroups.length} groups.`);
     return classifiedGroups;
   } catch (error) {
     functions.logger.error("Error during classification AI call or parsing:", error);
     // functions.logger.error("Prompt sent:", prompt); // 필요 시 프롬프트 로깅
     return [];
   }
}

// 그룹 요약 (Cloud Function 버전)
async function summarizeGroup(groupIds, allSessions) {
   // Gemini 클라이언트 초기화 확인 및 시도
   if (!initializeGeminiClient()) {
     functions.logger.error(`Failed to initialize Google AI SDK for group [${groupIds.join(', ')}]. Cannot proceed with summarization.`);
     return null;
   }
   functions.logger.log(`Summarizing group: [${groupIds.join(', ')}]...`);
   const groupSessions = allSessions.filter(s => groupIds.includes(s.id));
   if (groupSessions.length === 0) return null;

   const summarizationInput = groupSessions.map(s => ({ summaryTopic: s.summaryTopic, summaryPoints: s.summaryPoints, duration: s.duration }));
   const prompt = `Based on the following session details for a group, generate a concise summary, giving more weight to sessions with longer 'duration'.

Group Session Details:
${JSON.stringify(summarizationInput, null, 2)}

Generate the following information **in English**:
- classifiedTopic: A concise topic title (max 40 characters) summarizing the group's core theme.
- classifiedSummary: A summary of the content in 3-5 bullet points.
- classifiedKeywords: Up to 10 keywords representing the content.

Return the result **only** in the following valid JSON format:
{
  "classifiedTopic": "...",
  "classifiedSummary": ["...", "..."],
  "classifiedKeywords": ["...", ...]
}`;

   try {
     const result = await summarizationModel.generateContent(
         { contents: [{ role: "user", parts: [{ text: prompt }] }],
           generationConfig: { temperature: 0.2 }
         });
     const response = await result.response;
     const text = response.text();
      functions.logger.info(`Raw summarization response for group [${groupIds.join(', ')}}]:`, text);


     const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```|(\{[\s\S]*?\})/);
     let jsonString = text.trim();
     if (jsonMatch) jsonString = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[2].trim();

     const summaryResult = JSON.parse(jsonString);
      if (!summaryResult || typeof summaryResult.classifiedTopic !== 'string' || !Array.isArray(summaryResult.classifiedSummary) || !Array.isArray(summaryResult.classifiedKeywords)) throw new Error("Invalid format");
     functions.logger.log(`Successfully summarized group [${groupIds.join(', ')}}].`);
     return summaryResult;
   } catch (error) {
     functions.logger.error(`Error during summarization AI call or parsing for group [${groupIds.join(', ')}}]:`, error);
     // functions.logger.error("Prompt sent:", prompt); // 필요 시 프롬프트 로깅
     return null;
   }
}

// 총 시간 계산 (동일)
function calculateTotalDuration(groupIds, allSessions) {
   const groupSessions = allSessions.filter(s => groupIds.includes(s.id));
   return groupSessions.reduce((sum, session) => sum + session.duration, 0);
}

// Digital Routine 함수 export
exports.processTenMinuteBlocks = processTenMinuteBlocks;
// aggregateDailyDurations 함수 추가 export
exports.aggregateDailyDurations = aggregateDailyDurations;
