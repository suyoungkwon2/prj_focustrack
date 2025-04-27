// src/tests/classification/featureClassification.test.js

// .env 파일 로드를 위한 dotenv import 및 설정
import dotenv from 'dotenv';
dotenv.config(); // 프로젝트 루트의 .env 파일 로드

// Firebase SDK 및 Firestore 함수 import
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

// Google Generative AI SDK import
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- Firebase 설정 (환경 변수에서 로드) ---
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// --- Google AI 설정 ---
const googleApiKey = process.env.GEMINI_API_KEY;
if (!googleApiKey) {
  console.error("Error: GEMINI_API_KEY not found in .env file.");
  process.exit(1); // API 키 없으면 종료
}
const genAI = new GoogleGenerativeAI(googleApiKey);
const classificationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // 또는 다른 모델
const summarizationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // 또는 다른 모델

// --- Firebase 초기화 ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- 테스트 사용자 ID ---
const testUserId = "9de8ed54-c516-4c45-861d-e219b033bc7c"; // 실제 테스트할 UUID 사용

// --- 데이터 가져오기 함수 ---
async function getGrowthSessionsData(userId, count = 10) {
  console.log(`Fetching latest ${count} 'Growth' sessions for user: ${userId}...`);
  const sessions = [];
  try {
    const sessionsRef = collection(db, `users/${userId}/focusSessions`);
    const q = query(
      sessionsRef,
      where("summaryCategory", "==", "Growth"),
      orderBy("endTime", "desc"),
      limit(count)
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const sessionId = data.id || doc.id;
      sessions.push({
        id: sessionId,
        firebaseId: doc.id, // Firestore 문서 ID 추가 (디버깅/참조용)
        summaryTopic: data.summaryTopic || "",
        summaryPoints: data.summaryPoints || [],
        duration: data.duration || 0,
        url: data.url || "", // URL 정보 추가 (요약 시 참고 가능)
        title: data.title || "", // Title 정보 추가 (요약 시 참고 가능)
      });
    });
    console.log(`Successfully fetched ${sessions.length} sessions.`);
  } catch (error) {
    console.error("Error fetching Firestore data:", error);
  }
  return sessions;
}

// --- 1단계: 세션 분류 함수 ---
async function classifySessions(sessionsToClassify) {
  console.log("\nStarting session classification (Step 1)...");
  if (!sessionsToClassify || sessionsToClassify.length === 0) {
    console.log("No sessions to classify.");
    return [];
  }

  const classificationInput = sessionsToClassify.map(s => ({
    id: s.id,
    summaryTopic: s.summaryTopic,
    duration: s.duration
  }));

  const prompt = `다음 사용자 세션 목록을 'summaryTopic'의 의미론적 유사성을 기반으로 그룹화해주세요. 'duration'이 긴 세션의 내용에 더 높은 가중치를 부여하여 그룹화해주세요. 결과는 각 그룹에 속하는 세션 'id'들의 리스트 목록으로 반환해주세요. 반드시 유효한 JSON 배열 형식으로만 응답해주세요. 예: [["id1", "id5", "id12"], ["id2", "id8"], ["id3", "id10", "id25"]]

세션 목록:
${JSON.stringify(classificationInput, null, 2)}

JSON 결과:`;

  try {
    // AI 호출 시 generationConfig 추가 (temperature 낮춤)
    const result = await classificationModel.generateContent(
        { contents: [{ role: "user", parts: [{ text: prompt }] }], 
          generationConfig: { temperature: 0.2 } 
        });
    const response = await result.response;
    const text = response.text();
    console.log("Raw classification response:", text);

    // 응답 텍스트에서 JSON 부분만 추출 (```json ... ``` 형식 고려)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```|(\[\[[\s\S]*?\]\])/);
    let jsonString = text.trim();
    if (jsonMatch) {
        jsonString = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[2].trim();
    }


    // JSON 파싱 시도
    const classifiedGroups = JSON.parse(jsonString);

    // 결과 형식 검증 (배열 안의 배열인지)
    if (!Array.isArray(classifiedGroups) || !classifiedGroups.every(Array.isArray)) {
      throw new Error("Classification result is not an array of arrays.");
    }

    console.log(`Successfully classified into ${classifiedGroups.length} groups.`);
    return classifiedGroups; // 예: [[id1, id5], [id2, id8]]
  } catch (error) {
    console.error("Error during classification AI call or parsing:", error);
    console.error("Prompt sent:", prompt); // 디버깅 위해 프롬프트 출력
    return []; // 오류 발생 시 빈 배열 반환
  }
}

// --- 2단계: 그룹 요약 함수 ---
async function summarizeGroup(groupIds, allSessions) {
  console.log(`\nStarting summarization for group: [${groupIds.join(', ')}] (Step 2)...`);
  const groupSessions = allSessions.filter(s => groupIds.includes(s.id));

  if (groupSessions.length === 0) {
    console.log("No session data found for this group.");
    return null;
  }

  // AI 입력용 데이터 가공
  const summarizationInput = groupSessions.map(s => ({
      summaryTopic: s.summaryTopic,
      summaryPoints: s.summaryPoints,
      duration: s.duration
  }));

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
    // AI 호출 시 generationConfig 추가 (temperature 낮춤)
    const result = await summarizationModel.generateContent(
        { contents: [{ role: "user", parts: [{ text: prompt }] }], 
          generationConfig: { temperature: 0.2 } 
        });
    const response = await result.response;
    const text = response.text();
     console.log("Raw summarization response:", text);

    // 응답 텍스트에서 JSON 부분만 추출 (```json ... ``` 형식 고려)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```|(\{[\s\S]*?\})/);
     let jsonString = text.trim();
    if (jsonMatch) {
        jsonString = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[2].trim();
    }


    const summaryResult = JSON.parse(jsonString);

     // 결과 형식 검증
    if (!summaryResult || typeof summaryResult.classifiedTopic !== 'string' || !Array.isArray(summaryResult.classifiedSummary) || !Array.isArray(summaryResult.classifiedKeywords)) {
        throw new Error("Summarization result is not in the expected JSON format.");
    }


    console.log(`Successfully summarized group.`);
    return summaryResult; // 예: { classifiedTopic: "...", classifiedSummary: [...], classifiedKeywords: [...] }
  } catch (error) {
    console.error("Error during summarization AI call or parsing:", error);
    console.error("Prompt sent:", prompt); // 디버깅 위해 프롬프트 출력
    return null; // 오류 발생 시 null 반환
  }
}

// --- 총 시간 계산 함수 ---
function calculateTotalDuration(groupIds, allSessions) {
  const groupSessions = allSessions.filter(s => groupIds.includes(s.id));
  return groupSessions.reduce((sum, session) => sum + session.duration, 0);
}


// --- 메인 실행 로직 ---
(async () => {
  console.log("Starting Feature Classification Test...");

  // 1. 데이터 준비
  const growthSessions = await getGrowthSessionsData(testUserId, 10); // 테스트 위해 10개 로드
  if (growthSessions.length === 0) {
    console.log("No 'Growth' sessions fetched. Exiting.");
    return;
  }
  // console.log("\nFetched Growth Sessions Data:");
  // console.log(JSON.stringify(growthSessions.map(s => ({id: s.id, topic: s.summaryTopic, duration: s.duration})), null, 2)); // 간단 정보만 출력

  // 2. 1단계: 세션 분류
  const classifiedIdGroups = await classifySessions(growthSessions);
  if (classifiedIdGroups.length === 0) {
    console.log("Classification step failed or returned no groups. Exiting.");
    return;
  }
   console.log("\nClassification Result (Groups of IDs):");
   console.log(JSON.stringify(classifiedIdGroups, null, 2));

  // 3. 2단계: 그룹별 요약 및 시간 계산
  const finalResults = [];
  console.log("\nProcessing each group for summarization and duration calculation...");

  for (const groupIds of classifiedIdGroups) {
    const summary = await summarizeGroup(groupIds, growthSessions);
    if (summary) {
      const totalDuration = calculateTotalDuration(groupIds, growthSessions);
      finalResults.push({
        classifiedTopic: summary.classifiedTopic,
        classifiedSummary: summary.classifiedSummary,
        classifiedKeywords: summary.classifiedKeywords,
        totalDuration: totalDuration,
        sessionIds: groupIds, // 어떤 세션들이 묶였는지 ID 포함
      });
    } else {
         console.log(`Skipping group [${groupIds.join(', ')}] due to summarization error.`);
    }
  }

  // 4. 결과 정렬 및 필터링 (요구사항에 따라 상위 6개)
   console.log(`\nTotal ${finalResults.length} groups summarized.`);
  finalResults.sort((a, b) => b.totalDuration - a.totalDuration); // totalDuration 기준 내림차순 정렬
  const topResults = finalResults.slice(0, 6); // 상위 6개 그룹 선택

  // 5. 최종 결과 출력
  console.log("\n--- Final Feature Classification Results (Top 6 by Duration) ---");
  if (topResults.length > 0) {
    console.log(JSON.stringify(topResults, null, 2));
  } else {
    console.log("No final results could be generated.");
  }

  console.log("\nFeature Classification Test Finished.");
})(); 