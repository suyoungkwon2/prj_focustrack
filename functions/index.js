const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();
const db = admin.firestore(); // Firestore 인스턴스

// --- Google AI 설정 ---
let genAI;
let classificationModel;
let summarizationModel;
try {
  // 환경 변수에서 API 키 가져오기 (배포 전 설정 필요)
  // 로컬 터미널에서: firebase functions:config:set gemini.key="YOUR_API_KEY"
  const googleApiKey = functions.config().gemini?.key; // Optional chaining 사용
  if (!googleApiKey) {
    console.error("FATAL ERROR: Gemini API Key (functions.config().gemini.key) is not set.");
    // 실제 배포 시에는 여기서 함수 로드를 멈추는 것이 좋을 수 있습니다.
    // 하지만 로컬 에뮬레이터 테스트 등을 위해 일단 초기화는 진행합니다.
    // throw new Error("Gemini API Key is not configured."); // 필요시 에러 발생
  } else {
    genAI = new GoogleGenerativeAI(googleApiKey);
    classificationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    summarizationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("GoogleGenerativeAI initialized successfully.");
  }
} catch (error) {
  console.error("Error initializing GoogleGenerativeAI:", error);
}


// --- Firestore 트리거 함수 ---
exports.onFocusSessionCreate = functions.firestore
  .document("users/{userId}/focusSessions/{sessionId}")
  .onCreate(async (snap, context) => {
    const sessionData = snap.data();
    const userId = context.params.userId;

    // 1. 'Growth' 카테고리인지 확인
    if (sessionData.summaryCategory !== "Growth") {
      functions.logger.log(`User ${userId}, Session ${context.params.sessionId}: Not a 'Growth' session. Skipping.`);
      return null; // 'Growth' 아니면 함수 종료
    }

    functions.logger.log(`User ${userId}, Session ${context.params.sessionId}: 'Growth' session detected. Processing counter.`);

    // 2. 카운터 처리 (트랜잭션 사용)
    const counterRef = db.collection("userGrowthCounters").doc(userId);
    let shouldProcessClassification = false;

    try {
      await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let newCount = 1;

        if (counterDoc.exists) {
          const currentCount = counterDoc.data().count || 0;
          if (currentCount < 4) {
            newCount = currentCount + 1;
            transaction.update(counterRef, { count: newCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
             functions.logger.log(`User ${userId}: Counter incremented to ${newCount}.`);
          } else { // currentCount is 4, this session makes it 5
            newCount = 0; // Reset counter
            shouldProcessClassification = true; // Mark for processing
            transaction.set(counterRef, { count: newCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); // Reset counter
             functions.logger.log(`User ${userId}: Counter reached 5. Resetting to 0 and triggering classification.`);
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


// --- 분류 및 요약 처리 함수 ---
async function processClassification(userId) {
  functions.logger.log(`User ${userId}: processClassification started.`);

   // API 키 재확인 (초기화 실패 시)
   if (!genAI || !classificationModel || !summarizationModel) {
     functions.logger.error(`User ${userId}: Google AI SDK not initialized correctly. Cannot proceed.`);
     return;
   }

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
    const sessionsRef = db.collection(`users/${userId}/focusSessions`);
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