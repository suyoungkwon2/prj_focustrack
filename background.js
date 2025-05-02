// background.js
import { db, auth, signInAnonymously, collection, addDoc, doc, updateDoc, query, where, getDocs, orderBy, setDoc, serverTimestamp } from './firebase-config.js';
// Firestore 함수들을 직접 가져오도록 수정 (-> 원복)
// import { serverTimestamp } from 'firebase/firestore'; 
import { analyzeYouTubeVideo, isExtractableUrl } from './youtubedataextraction/youtubedataextraction.js';
// import { getFocusSessionsByPeriod } from './src/features/digital_routine/firebaseUtils.js'; // Keep this commented for now

console.log("Background script loaded"); // Simplified log

let lastActivityTime = Date.now();
let activeStartTime = null;
const ACTIVE_SESSION_THRESHOLD = 15 * 1000;
const MERGE_WINDOW = 10 * 60 * 1000;

let eventCounter = { mousemove: 0, click: 0, keydown: 0 };
let senderURLCache = null;

// 사용자 UUID 초기화
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['userUUID'], (result) => {
    if (!result.userUUID) {
      const userUUID = generateUUID();
      chrome.storage.local.set({ userUUID }, () => {
        console.log('[UUID] Generated new user UUID:', userUUID);
      });
    }
  });
});

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().replace("T", " ").substring(0, 19);
}

function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// Gemini API 응답 파싱 및 정리 함수 - 함수 위치 이동 (먼저 정의)
function cleanGeminiResponse(text) {
  try {
    // 메인 토픽 추출 및 정리
    let topicMatch = text.match(/Main Topic\s*[:\-]?\s*(.*?)(?=\n|$)/is);
    let cleanTopic = topicMatch ? topicMatch[1].trim() : "";
    // 별표, 숫자, 불릿 포인트 등 제거
    cleanTopic = cleanTopic.replace(/^[\s*#\d.]+|[\s*#\d.]+$/g, "").trim();
    
    // 키 포인트 추출
    let pointsSection = text.match(/Key Points\s*[:\-]?\s*([\s\S]*?)(?=Category|$)/is);
    let points = [];
    
    if (pointsSection && pointsSection[1]) {
      // 각 줄을 추출하여 정리
      points = pointsSection[1].split(/\n+/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        // 불릿 포인트, 별표, 숫자 등 제거
        .map(line => line.replace(/^[\s*#\d.•○▪➢➤▸▹►▻→⇒⟹⟾]+|[\s*#\d.]+$/g, "").trim())
        // 내용이 있는 라인만 유지
        .filter(line => line.length > 0 && !/^Category/i.test(line));
    }
    
    // 카테고리 추출 및 정리
    let categoryMatch = text.match(/Category\s*[:\-]?\s*(.*?)(?=\n|$)/is);
    let cleanCategory = categoryMatch ? categoryMatch[1].trim() : "";
    // 별표, 숫자 등 제거
    cleanCategory = cleanCategory.replace(/^[\s*#\d.]+|[\s*#\d.]+$/g, "").trim();
    
    return {
      topic: cleanTopic,
      points: points,
      category: cleanCategory
    };
  } catch (error) {
    console.error("[CLEANING] Error cleaning Gemini response:", error);
    // 오류 발생 시 원본 파싱 결과 반환
    return {
      topic: "",
      points: [],
      category: ""
    };
  }
}

// Gemini API 요약 함수
async function summarizeWithGemini({ url, title, bodyText }) {
  try {
    const GEMINI_API_KEY = "AIzaSyCsfpWTHI36q2CI-1BQqc95WXN38kTPv1A";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `
You are a web analysis assistant for a user focus tracking system.

Given a web page's metadata and body content (including potential noise or non-essential information), complete the following tasks with careful judgment:

---

Instructions:

1. Main Topic  
Summarize the main topic of the webpage in one concise and informative sentence**. Focus on the page's **core purpose and content, filtering out advertisements, navigation elements, or unrelated filler content.

2. Key Points  
Extract 3 to 5 bullet points highlighting the most important ideas, facts, or messages. Ignore irrelevant or repetitive sections.

3. Category Classification
Classify the page into one of the following three categories, based on both the content and the user's apparent intent:

- Growth: For learning, research, news, articles, professional knowledge, or educational purposes.  
  _e.g. Reading news articles, watching science lectures on YouTube, researching books or academic topics._

- Daily Life: For managing personal tasks, logistics, or everyday necessities.  
  _e.g. Grocery shopping, checking maps, browsing recipes, looking up local services._

- Entertainment: For fun, leisure, and pleasure-driven content.  
  _e.g. Watching variety shows, music streaming, playing games, or browsing meme sites._

📌 Note: If the URL suggests a generic platform (e.g. YouTube, Amazon), always analyze the actual content and context before assigning a category.

---

Response Format:
Your response must follow this exact format:

1. Main Topic: [Your one-sentence summary here]

2. Key Points:
   * [First key point]
   * [Second key point]
   * [Third key point]
   * [Fourth key point] (if applicable)
   * [Fifth key point] (if applicable)

3. Category: [Growth/Daily Life/Entertainment]

Do not include any additional text, explanations, or formatting outside of this structure.

---

URL: ${url}  
Title: ${title}  
Content:  
${bodyText.slice(0, 10000)}
`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    const result = await response.json();
    console.log("[GEMINI] Raw API Response:", JSON.stringify(result, null, 2));
    console.log("[GEMINI] Generated Text:", result?.candidates?.[0]?.content?.parts?.[0]?.text || "[No summary returned]");
    return result?.candidates?.[0]?.content?.parts?.[0]?.text || "[No summary returned]";
  } catch (error) {
    console.error("[GEMINI] API call failed:", error);
    return "[Gemini API error]";
  }
}

// --- 익명 인증 함수 정의 (다른 함수들보다 먼저) ---
async function ensureAuthenticated() {
  // !!! auth 객체가 여기서 사용 가능해야 함 !!!
  if (auth.currentUser) {
    console.log("[AUTH] Already authenticated:", auth.currentUser.uid);
    return auth.currentUser;
  }
  try {
    console.log("[AUTH] Attempting anonymous sign-in...");
    const userCredential = await signInAnonymously(auth);
    console.log("[AUTH] Signed in anonymously:", userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error("[AUTH] Anonymous sign-in failed:", error);
    return null; 
  }
}

// --- Firestore 함수 (수정됨) ---
async function saveSessionToFirebase(session) {
  let firebaseUID = null; // catch 블록에서도 사용하기 위해 함수 스코프로 이동
  try {
    console.log("[DEBUG] Attempting to ensure authentication before saving...");
    const currentUser = await ensureAuthenticated(); // ensureAuthenticated 호출
    if (!currentUser) {
      console.error("[FIREBASE] Authentication failed OR user is null BEFORE saving. Cannot save session.");
      // auth 객체 상태 로깅 (auth가 import 되었다면 여기서 접근 가능해야 함)
      console.log("[DEBUG] Current auth state:", auth?.currentUser); 
      return null;
    }
    firebaseUID = currentUser.uid; // firebaseUID 변수에 할당
    console.log(`[DEBUG] Authentication ensured. User UID: ${firebaseUID}, isAnonymous: ${currentUser.isAnonymous}`);

    const userSessionsRef = collection(db, `users/${firebaseUID}/focusSessions`);
    console.log(`[DEBUG] Firestore path: users/${firebaseUID}/focusSessions`);

    const { userUUID: localUUID } = await chrome.storage.local.get(['userUUID']);
    session.userUUID = firebaseUID;  
    session.localUUID = localUUID;   
    
    console.log("[DEBUG] Data to be saved:", JSON.stringify(session));

    const docRef = await addDoc(userSessionsRef, session); 
    console.log("[FIREBASE] Session saved successfully with ID:", docRef.id, "for user:", firebaseUID);
    
    // --- '/users_list' 문서 생성 로직 시작 ---
    // Firestore 저장이 성공한 후에만 실행
    try {
      // 멜 수정: 디버깅 로그 추가 (1/3)
      console.log(`[USER_LIST_DEBUG] Preparing to ensure user document in /users_list.`);
      console.log(`[USER_LIST_DEBUG] Target Firebase UID: ${firebaseUID}`);
      const userListRef = doc(db, "users_list", firebaseUID); 
      const { userUUID: localUUID } = await chrome.storage.local.get(['userUUID']); // 로컬 UUID 다시 가져오기
      const userListData = { 
        firebaseAuthUid: firebaseUID, 
        localUUID: localUUID || 'UUID_NOT_FOUND', // 로컬 UUID 없을 경우 대비
        createdAt: serverTimestamp() 
      };
      // 멜 수정: 디버깅 로그 추가 (2/3)
      console.log(`[USER_LIST_DEBUG] Data to set:`, JSON.stringify(userListData));
      
      await setDoc(userListRef, userListData, { merge: true }); 
      // 멜 수정: 성공 로그 추가 (3/3)
      console.log(`[USER_LIST] Successfully ensured user document exists in /users_list for ${firebaseUID}`);
    } catch (userListError) {
      console.error(`[USER_LIST] Error ensuring user document in /users_list for ${firebaseUID}:`, userListError);
      // 에러 발생 시 추가 정보 로깅
      console.error(`[USER_LIST_DEBUG] Error details: code=${userListError.code}, message=${userListError.message}`);
    }
    // --- '/users_list' 문서 생성 로직 끝 ---

    // ... (로컬 스토리지 업데이트) ...
    session.firebaseId = docRef.id; // firebaseId 추가
     chrome.storage.local.get(["focusSessions"], (res) => {
       const sessions = res.focusSessions || [];
       const sessionIndex = sessions.findIndex(s => s.id === session.id);
       if (sessionIndex !== -1) {
         sessions[sessionIndex].firebaseId = docRef.id;
         sessions[sessionIndex].userUUID = firebaseUID; 
         sessions[sessionIndex].localUUID = localUUID; 
         chrome.storage.local.set({ focusSessions: sessions });
       }
     });

    return docRef.id;
  } catch (error) {
    console.error("[FIREBASE] Error saving session:", error); 
    // 수정: catch 블록에서 auth 대신 firebaseUID 변수 사용
    console.error("[DEBUG] Error occurred while trying to save for Firebase UID:", firebaseUID); // 에러 발생 시점의 UID 확인 (변수 사용)
    console.error("[DEBUG] Full error object:", error); 
    return null;
  }
}

async function updateSessionInFirebase(session) {
   let firebaseUID = session.userUUID; // 업데이트 시에는 세션 데이터의 UID 사용 가정
   try {
     if (!session.firebaseId) { /* ... */ }

     // 인증 상태 확인 (업데이트 시에도 필요)
     const currentUser = await ensureAuthenticated();
     if (!currentUser) { /* ... */ return false; }
     // 현재 인증된 UID와 세션의 UID가 같은지 확인 (선택적이지만 권장)
     if (currentUser.uid !== session.userUUID) {
         console.warn(`[FIREBASE] Mismatch between current auth UID (${currentUser.uid}) and session UID (${session.userUUID}) during update. Using session UID.`);
         // firebaseUID = currentUser.uid; // 현재 UID를 강제할 수도 있음
     }
     firebaseUID = session.userUUID; // 세션의 UID를 기준으로 업데이트

     if (!session.localUUID) { /* ... */ }

     const sessionRef = doc(db, `users/${firebaseUID}/focusSessions`, session.firebaseId);
     
     // ... (updateData 준비) ...
      const updateData = { /* ... */ };
      if (session.extractionError) { /* ... */ }


     await updateDoc(sessionRef, updateData);
     console.log("[FIREBASE] Session updated:", session.firebaseId, "for user:", firebaseUID);
     return true;
   } catch (error) {
     console.error("[FIREBASE] Error updating session:", error);
     console.error("[DEBUG] Error occurred while trying to update for Firebase UID:", firebaseUID); // 변수 사용
     console.error("[DEBUG] Full error object:", error);
     return false;
   }
}

// AI 요약 및 이미지 추출 함수 (재시도 로직 포함)
async function extractContentAndSummarize(tabId, url, title) {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      console.log(`[EXTRACT] Attempt ${attempts + 1} starting for ${url}`);
      
      // URL 추출 가능성 검사
      if (!isExtractableUrl(url)) {
        console.log("[EXTRACT] URL is not extractable, skipping content extraction");
        return {
          success: true,
          fullText: "",
          images: [],
          summary: {
            topic: "Unavailable",
            points: ["Content extraction not available for this URL"],
            category: "Unknown"
          }
        };
      }
      
      // YouTube 영상인 경우 처리
      if (url.includes("youtube.com/watch?v=") || url.includes("youtu.be/") || url.includes("youtube.com/shorts/")) {
        console.log("[EXTRACT] YouTube video detected, using YouTube data extraction");
        console.log("[EXTRACT] YouTube URL:", url);
        
        try {
          const videoData = await analyzeYouTubeVideo(url);
          console.log("[EXTRACT] YouTube video data:", videoData);
          
          if (!videoData) {
            console.error("[EXTRACT] Failed to extract YouTube video data");
            throw new Error("Failed to extract YouTube video data");
          }
          
          // Gemini API 호출 (타임아웃 추가)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          
          try {
            console.log("[GEMINI] Calling API for YouTube video summary...");
            const aiResult = await summarizeWithGemini({ 
              url: url, 
              title: videoData.title || title, 
              bodyText: `${videoData.description || ''}\n\nTags: ${videoData.tags.join(', ')}\n\nCaptions: ${videoData.captions || ''}`
            });
            
            clearTimeout(timeoutId);
            
            if (!aiResult || aiResult === "[No summary returned]" || aiResult === "[Gemini API error]") {
              console.error("[GEMINI] Invalid API response:", aiResult);
              throw new Error("Failed to get valid summary from Gemini API");
            }
            
            console.log("[GEMINI] Processing API response with cleanGeminiResponse");
            const cleanedResponse = cleanGeminiResponse(aiResult);
            
            return {
              success: true,
              fullText: `${videoData.description || ''}\n\nTags: ${videoData.tags.join(', ')}\n\nCaptions: ${videoData.captions || ''}`,
              images: [], // YouTube 영상의 경우 이미지는 추출하지 않음
              summary: {
                topic: cleanedResponse.topic,
                points: cleanedResponse.points,
                category: cleanedResponse.category
              }
            };
          } catch (apiError) {
            clearTimeout(timeoutId);
            console.error("[GEMINI] API call failed:", apiError);
            throw apiError;
          }
        } catch (error) {
          console.error("[EXTRACT] YouTube data extraction failed:", error);
          // 에러가 발생해도 기본 세션 정보는 저장
          return {
            success: true,
            fullText: "",
            images: [],
            summary: {
              topic: "YouTube Video",
              points: ["Failed to extract detailed information"],
              category: "Entertainment"
            }
          };
        }
      }
      
      // 일반 웹사이트 처리 (기존 로직)
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          // 텍스트 추출
          const bodyText = document.body.innerText;
          
          // 중요 이미지 추출 (최소 크기 이상인 이미지만)
          const images = Array.from(document.querySelectorAll('img')).filter(img => {
            // 이미지가 표시되어 있고 최소 크기 이상인 것만 필터링
            const rect = img.getBoundingClientRect();
            return img.src && 
                  img.complete && // 로드된 이미지만
                  rect.width >= 200 && 
                  rect.height >= 150 && 
                  img.src.startsWith('http') && // 유효한 URL만
                  !img.src.includes('data:'); // base64 이미지 제외
          }).slice(0, 5).map(img => ({ // 상위 5개만 저장
            url: img.src,
            alt: img.alt || '',
            width: img.width,
            height: img.height
          }));
          
          return { bodyText, images };
        }
      });
      
      // 결과 확인: bodyText와 images가 제대로 있는지
      if (!result || !result.bodyText) {
        throw new Error("Failed to extract page content");
      }
      
      const fullText = result.bodyText;
      const pageImages = result.images || [];
      
      console.log(`[EXTRACT] Content extracted, text length: ${fullText.length}, images: ${pageImages.length}`);
      
      // Gemini API 호출 (타임아웃 추가)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 15초 타임아웃
      
      try {
        console.log("[GEMINI] Calling API for summary...");
        const aiResult = await summarizeWithGemini({ 
          url: url, 
          title: title, 
          bodyText: fullText 
        });
        
        clearTimeout(timeoutId);
        
        if (!aiResult || aiResult === "[No summary returned]" || aiResult === "[Gemini API error]") {
          throw new Error("Failed to get valid summary from Gemini API");
        }
        
        console.log("[GEMINI] Processing API response with cleanGeminiResponse");
        // cleanGeminiResponse 함수로 응답 정리
        const cleanedResponse = cleanGeminiResponse(aiResult);
        
        return {
          success: true,
          fullText,
          images: pageImages,
          summary: {
            topic: cleanedResponse.topic,
            points: cleanedResponse.points,
            category: cleanedResponse.category
          }
        };
      } catch (apiError) {
        clearTimeout(timeoutId);
        console.error("[GEMINI] API call failed:", apiError);
        throw apiError;
      }
    } catch (error) {
      attempts++;
      console.error(`[EXTRACT] Attempt ${attempts} failed:`, error);
      
      if (attempts >= maxAttempts) {
        console.error("[EXTRACT] All attempts failed, returning error");
        return {
          success: false,
          error: error.message || "Unknown error",
          extractionError: {
            message: error.message,
            url: url,
            timestamp: new Date().toISOString(),
            attempts: attempts
          }
        };
      }
      
      // 점진적 재시도 대기 시간 (backoff)
      const waitTime = Math.pow(2, attempts) * 1000; // 2초, 4초, 8초...
      console.log(`[EXTRACT] Waiting ${waitTime}ms before next attempt`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "userActivity") {
    lastActivityTime = message.timestamp;
    if (message.url) senderURLCache = message.url;

    console.log(`[ACTIVE] ${message.eventType} on ${message.url} at ${new Date(message.timestamp).toLocaleTimeString()}`);

    if (!activeStartTime) {
      activeStartTime = lastActivityTime;
      eventCounter = { mousemove: 0, click: 0, keydown: 0 };
    }

    if (eventCounter[message.eventType] !== undefined) {
      eventCounter[message.eventType]++;
    }
  }

  if (message.type === 'getActiveTabInfo') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const activeTab = tabs[0];
      sendResponse({
        url: activeTab.url,
        title: activeTab.title
      });
    });
    return true;
  }
});

// 스크립트 시작 시 익명 로그인 시도
ensureAuthenticated().then(user => {
  if (user) {
    console.log("[INIT] Initial anonymous auth successful.");
  } else {
    console.error("[INIT] Initial anonymous auth failed.");
  }
});

setInterval(() => {
  const now = Date.now();

  if (activeStartTime && now - lastActivityTime > 5000) {
    const duration = Math.floor((lastActivityTime + 5000 - activeStartTime) / 1000);
    const sessionType = duration >= ACTIVE_SESSION_THRESHOLD / 1000 ? "active" : "inactive";
    const startTime = activeStartTime;
    const endTime = lastActivityTime + 5000;
    const fallbackURL = senderURLCache || "unknown";

    console.log(`[SESSION END] SessionType: ${sessionType} | Duration: ${duration}s | URL: ${fallbackURL}`);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const tabInfo = {
        id: tab?.id,
        url: tab?.url || fallbackURL,
        title: tab?.title || "Unknown Page"
      };

      chrome.storage.local.get(["focusSessions", "userUUID"], async (res) => {
        const sessions = res.focusSessions || [];
        const localUUID = res.userUUID;
        let mergeableSessionIndex = -1;
        
        // 병합 가능한 세션 찾기
        for (let i = sessions.length - 1; i >= 0; i--) {
          const session = sessions[i];
          const urlToCompare = tabInfo.url; // 현재 활동의 URL

          // URL이 YouTube 영상 페이지인지 확인하는 함수
          const isYouTubeVideoPage = (url) => url?.includes("youtube.com/watch?v=") || url?.includes("youtu.be/");

          // 기본 병합 조건 확인
          const urlsMatch = session.url === urlToCompare;
          const withinMergeWindow = startTime - session.endTime <= MERGE_WINDOW;

          if (urlsMatch && withinMergeWindow) {
            // URL이 일치하고 시간 조건 만족 시, YouTube 영상 페이지인지 추가 확인
            if (isYouTubeVideoPage(urlToCompare)) {
              // YouTube 영상 페이지 URL인 경우 병합하지 않음
              console.log(`[MERGE CHECK] Potential merge candidate found at index ${i} for URL ${urlToCompare}, but skipping because it is a YouTube video page.`);
              // mergeableSessionIndex 를 설정하지 않고 다음 루프로 넘어감 (사실상 병합 건너뛰기)
            } else {
              // YouTube 영상 페이지가 아니면 병합 허용
              mergeableSessionIndex = i;
              console.log(`[MERGE CHECK] Found mergeable non-YouTube session at index ${i} for URL ${urlToCompare}. Time diff: ${(startTime - session.endTime) / 1000}s`);
              break; // 가장 최근의 병합 대상 찾음
            }
          }
        }
        
        // 병합 또는 새 세션 생성 로직 시작
        if (mergeableSessionIndex !== -1) {
          // --- 세션 병합 처리 ---
          const mergeableSession = sessions[mergeableSessionIndex];
          console.log("[MERGE] with session:", mergeableSession.id);
          
          mergeableSession.visitCount = (mergeableSession.visitCount || 1) + 1;
          
          mergeableSession.endTime = endTime;
          mergeableSession.endTimeFormatted = formatTime(endTime);
          
          mergeableSession.duration += duration;
          
          mergeableSession.eventCount.mousemove += eventCounter.mousemove;
          mergeableSession.eventCount.click += eventCounter.click;
          mergeableSession.eventCount.keydown += eventCounter.keydown;
          
          mergeableSession.segments.push({ start: startTime, end: endTime });
          
          if (mergeableSession.sessionType === "inactive" && 
              mergeableSession.duration >= ACTIVE_SESSION_THRESHOLD / 1000) {
            console.log("[SESSION] Converting from inactive to active:", mergeableSession.id);
            mergeableSession.sessionType = "active";
            
            if (tabInfo.id) {
              try {
                console.log("[AI] Starting content extraction and summarization");
                const contentResult = await extractContentAndSummarize(
                  tabInfo.id,
                  tabInfo.url,
                  tabInfo.title
                );
                
                if (contentResult && contentResult.success) {
                  mergeableSession.images = contentResult.images || [];
                  mergeableSession.summaryTopic = contentResult.summary.topic || "";
                  mergeableSession.summaryPoints = contentResult.summary.points || [];
                  mergeableSession.summaryCategory = contentResult.summary.category || "";
                  
                  console.log("[GEMINI] Updated merged session:", mergeableSession.id);
                  console.log("[SUMMARY] Topic:", mergeableSession.summaryTopic);
                  console.log("[IMAGES] Extracted images:", contentResult.images?.length || 0);
                } else {
                  mergeableSession.extractionError = contentResult?.extractionError || {
                    message: "Failed to extract content",
                    url: tabInfo.url,
                    timestamp: new Date().toISOString(),
                    attempts: 0
                  };
                  console.error("[EXTRACT] Content extraction failed:", mergeableSession.extractionError);
                }
              } catch (error) {
                mergeableSession.extractionError = {
                  message: error.message || "Unknown error during extraction",
                  url: tabInfo.url,
                  timestamp: new Date().toISOString(),
                  attempts: 0
                };
                console.error("[EXTRACT] Error during content extraction:", mergeableSession.extractionError);
              }
            } else {
              console.log("[EXTRACT] Skipping content extraction due to missing tab ID");
            }
          }
          
          if (mergeableSession.firebaseId) {
            await updateSessionInFirebase(mergeableSession);
            console.log("[FIREBASE] Updated session:", mergeableSession.firebaseId);
          } else {
            mergeableSession.firebaseId = await saveSessionToFirebase(mergeableSession);
            console.log("[FIREBASE] Saved new session ID:", mergeableSession.firebaseId);
          }
          
          console.log("[SESSION MERGED] Total duration:", mergeableSession.duration, 
                      "Visit count:", mergeableSession.visitCount, 
                      "Segments:", mergeableSession.segments.length);
          
          const latestSessionForUpdate = sessions[mergeableSessionIndex !== -1 ? mergeableSessionIndex : sessions.length - 1];
          if (latestSessionForUpdate && latestSessionForUpdate.userUUID) {
            // 이전 로직에서 이미 업데이트된 부분이 있으므로 여기서는 추가 작업 필요 없음
          }
        } else {
          const currentUser = await ensureAuthenticated();
          if (!currentUser) {
              console.error("[NEW SESSION] Cannot create session, authentication failed.");
              activeStartTime = null; 
              return; 
          }
          const firebaseUID = currentUser.uid;

          let newSession = {
            id: generateUUID(),           
            userUUID: firebaseUID,        
            localUUID: localUUID,        
            startTime,
            startTimeFormatted: formatTime(startTime),
            endTime,
            endTimeFormatted: formatTime(endTime),
            duration,
            sessionType,
            url: tabInfo.url,
            title: tabInfo.title,
            domain: tabInfo.url?.split("/")[2] || "unknown", 
            canTrackActivity: true,
            eventCount: { ...eventCounter },
            summaryTopic: "",
            summaryPoints: [],
            summaryCategory: "",
            segments: [{ start: startTime, end: endTime }],
            images: [],
            visitCount: 1,
            extractionError: null,
            firebaseId: null
          };
          console.log("[DEBUG] Initial newSession object created:", newSession.id);

          if (sessionType === "active" && tabInfo.id) {
            try {
              console.log("[AI] Starting content extraction and summarization for new session");
              const contentResult = await extractContentAndSummarize(
                tabInfo.id,
                tabInfo.url,
                tabInfo.title
              );
              if (contentResult && contentResult.success) {
                newSession.images = contentResult.images || [];
                newSession.summaryTopic = contentResult.summary.topic || "";
                newSession.summaryPoints = contentResult.summary.points || [];
                newSession.summaryCategory = contentResult.summary.category || "";
                console.log("[AI] Summary generated successfully for new session");
              } else {
                newSession.extractionError = contentResult?.extractionError || { message: "Unknown extraction failure" }; 
                console.error("[AI] Content extraction failed for new session:", newSession.extractionError);
              }
            } catch (error) {
              console.error("[AI] Error during content extraction for new session:", error);
              newSession.extractionError = { message: error.message || "Unknown error during extraction" };
            }
          } else {
            console.log("[AI] Inactive session or missing tab ID, skipping AI summarization for new session");
          }

          try {
             console.log("[DEBUG] Saving newSession to Firebase...");
             const savedFirebaseId = await saveSessionToFirebase(newSession); 
             if (savedFirebaseId) {
                 newSession.firebaseId = savedFirebaseId;
                 sessions.push(newSession);
                 console.log("[NEW SESSION] Created and saved:", newSession.id, "Firebase ID:", newSession.firebaseId);
             } else {
                 console.error("[NEW SESSION] Failed to save session to Firebase (saveSessionToFirebase returned null). Session not added to local storage.");
             }
          } catch (error) {
              console.error("[NEW SESSION] Error calling saveSessionToFirebase:", error);
          }
        }

        if (sessions.length > 0) {
            chrome.storage.local.set({ focusSessions: sessions }, () => {
              console.log("[STORAGE] Sessions saved. Total:", sessions.length);
              if (sessions.length > 0) {
                  const latestSession = sessions[sessions.length - 1];
                  console.log("[SESSION PREVIEW]", JSON.stringify(latestSession, (key, value) => key === 'images' ? `[${value?.length || 0} images]` : value, 2));
              }
            });
        }
      });
    });

    activeStartTime = null;
  }
}, 5000);

// --- Digital Routine 관련 함수들 (수정됨: getFocusSessionsByPeriod 만 남김) ---

// getFocusSessionsByPeriod 함수 (변경 없음)
export async function getFocusSessionsByPeriod(userId, startDate, endDate) {
  if (!userId || !startDate || !endDate) {
    console.error("[getFocusSessionsByPeriod] Error: Missing required parameters (userId, startDate, endDate).");
    return null;
  }

  const startTimeMs = startDate.getTime();
  const endTimeMs = endDate.getTime();

  console.log(`[getFocusSessionsByPeriod] Fetching sessions for user ${userId} between ${startDate.toISOString()} (${startTimeMs}) and ${endDate.toISOString()} (${endTimeMs})`);

  try {
    const sessionsRef = collection(db, `users/${userId}/focusSessions`);
    const q = query(sessionsRef, 
                    where('startTime', '>=', startTimeMs), 
                    where('startTime', '<=', endTimeMs), 
                    orderBy('startTime', 'asc'));

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log(`[getFocusSessionsByPeriod] No sessions found for user ${userId} in the specified period.`);
      return [];
    }

    const sessions = [];
    querySnapshot.forEach((doc) => {
      sessions.push({
        firebaseId: doc.id,
        ...doc.data()
      });
    });

    console.log(`[getFocusSessionsByPeriod] Successfully fetched ${sessions.length} sessions from Firestore.`);
    return sessions;

  } catch (error) {
    console.error(`[getFocusSessionsByPeriod] Error fetching sessions from Firestore for user ${userId}:`, error);
    if (error.code === 'failed-precondition') {
        console.error("[getFocusSessionsByPeriod] Firestore query failed likely due to a missing index. Please check your Firestore console.");
    }
    return null;
  }
}

// --- 스크립트 로드 완료 로그 ---
console.log("Background script setup complete. Removed hourlyBlocks logic.");