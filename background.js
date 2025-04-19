// background.js
import { db, collection, addDoc, doc, updateDoc } from './firebase-config.js';
import { analyzeYouTubeVideo, isExtractableUrl } from './youtubedataextraction/youtubedataextraction.js';

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

// Firebase에 세션 저장 함수
async function saveSessionToFirebase(session) {
  try {
    // 사용자 UUID 가져오기
    const { userUUID } = await chrome.storage.local.get(['userUUID']);
    if (!userUUID) {
      console.error("[FIREBASE] No user UUID found");
      return null;
    }

    // 사용자별 컬렉션에 저장
    const userSessionsRef = collection(db, `users/${userUUID}/focusSessions`);
    const docRef = await addDoc(userSessionsRef, session);
    console.log("[FIREBASE] Session saved with ID:", docRef.id);
    
    // Firebase 문서 ID를 세션에 저장 (업데이트 용도)
    session.firebaseId = docRef.id;
    
    // 로컬 스토리지에도 Firebase ID 저장
    chrome.storage.local.get(["focusSessions"], (res) => {
      const sessions = res.focusSessions || [];
      const sessionIndex = sessions.findIndex(s => s.id === session.id);
      if (sessionIndex !== -1) {
        sessions[sessionIndex].firebaseId = docRef.id;
        chrome.storage.local.set({ focusSessions: sessions });
      }
    });
    
    return docRef.id;
  } catch (error) {
    console.error("[FIREBASE] Error saving session:", error);
    return null;
  }
}

// Firebase 세션 업데이트 함수
async function updateSessionInFirebase(session) {
  if (!session.firebaseId) {
    console.error("[FIREBASE] Cannot update session without firebaseId");
    return false;
  }
  
  try {
    // 사용자 UUID 가져오기
    const { userUUID } = await chrome.storage.local.get(['userUUID']);
    if (!userUUID) {
      console.error("[FIREBASE] No user UUID found");
      return false;
    }

    // 사용자별 컬렉션에서 문서 참조 생성
    const sessionRef = doc(db, `users/${userUUID}/focusSessions`, session.firebaseId);
    
    // 세션 데이터로 문서 업데이트
    await updateDoc(sessionRef, {
      endTime: session.endTime,
      endTimeFormatted: session.endTimeFormatted,
      duration: session.duration,
      sessionType: session.sessionType,
      eventCount: session.eventCount,
      summaryTopic: session.summaryTopic,
      summaryPoints: session.summaryPoints,
      summaryCategory: session.summaryCategory,
      segments: session.segments,
      images: session.images || [],
      visitCount: session.visitCount || 1
    });
    
    console.log("[FIREBASE] Session updated:", session.firebaseId);
    return true;
  } catch (error) {
    console.error("[FIREBASE] Error updating session:", error);
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
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃
      
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

      // tabId가 없는 경우에도 세션 저장 진행
      chrome.storage.local.get(["focusSessions"], async (res) => {
        const sessions = res.focusSessions || [];
        
        // 병합 가능한 세션 찾기: 같은 URL의 세션 중에서 최근 10분 이내에 종료된 세션 찾기
        let mergeableSessionIndex = -1;
        
        // 세션 배열을 역순으로 순회하여 가장 최근 세션부터 확인
        for (let i = sessions.length - 1; i >= 0; i--) {
          const session = sessions[i];
          if (session.url === tabInfo.url && 
              startTime - session.endTime <= MERGE_WINDOW) {
            mergeableSessionIndex = i;
            console.log(`[MERGE CHECK] Found mergeable session at index ${i}: ${session.id}, URL: ${session.url}, Time diff: ${(startTime - session.endTime) / 1000}s`);
            break;
          }
        }
        
        // 병합 가능한 세션이 있는 경우
        if (mergeableSessionIndex !== -1) {
          const mergeableSession = sessions[mergeableSessionIndex];
          console.log("[MERGE] with session:", mergeableSession.id);
          
          // 방문 횟수 증가 (필드가 없으면 1로 초기화)
          mergeableSession.visitCount = (mergeableSession.visitCount || 1) + 1;
          
          // 시간 업데이트
          mergeableSession.endTime = endTime;
          mergeableSession.endTimeFormatted = formatTime(endTime);
          
          // 총 지속 시간 합산
          mergeableSession.duration += duration;
          
          // 이벤트 카운트 합산
          mergeableSession.eventCount.mousemove += eventCounter.mousemove;
          mergeableSession.eventCount.click += eventCounter.click;
          mergeableSession.eventCount.keydown += eventCounter.keydown;
          
          // 세션 조각 추가
          mergeableSession.segments.push({ start: startTime, end: endTime });
          
          // Inactive에서 Active로 변경되는 경우 처리
          if (mergeableSession.sessionType === "inactive" && 
              mergeableSession.duration >= ACTIVE_SESSION_THRESHOLD / 1000) {
            console.log("[SESSION] Converting from inactive to active:", mergeableSession.id);
            mergeableSession.sessionType = "active";
            
            // Tab ID가 있는 경우에만 콘텐츠 추출 시도
            if (tabInfo.id) {
              try {
                // 콘텐츠 추출 및 AI 요약
                console.log("[AI] Starting content extraction and summarization");
                const contentResult = await extractContentAndSummarize(
                  tabInfo.id,
                  tabInfo.url,
                  tabInfo.title
                );
                
                if (contentResult && contentResult.success) {
                  // 세션 업데이트
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
          
          // Firebase에 업데이트
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
          
        } else {
          // 새 세션 생성
          const { userUUID } = await chrome.storage.local.get(['userUUID']);
          const newSession = {
            id: generateUUID(),
            userUUID: userUUID,
            startTime,
            startTimeFormatted: formatTime(startTime),
            endTime,
            endTimeFormatted: formatTime(endTime),
            duration,
            sessionType,
            url: tabInfo.url,
            title: tabInfo.title,
            domain: tabInfo.url.split("/")[2] || "unknown",
            canTrackActivity: true,
            eventCount: { ...eventCounter },
            summaryTopic: "",
            summaryPoints: [],
            summaryCategory: "",
            segments: [{ start: startTime, end: endTime }],
            images: [],
            visitCount: 1,
            extractionError: null
          };
          
          // Active 세션이고 Tab ID가 있는 경우에만 AI 요약 및 이미지 추출 진행
          if (sessionType === "active" && tabInfo.id) {
            try {
              console.log("[NEW SESSION] Active session created, starting AI summarization");
              
              // 콘텐츠 추출 및 AI 요약
              const contentResult = await extractContentAndSummarize(
                tabInfo.id,
                tabInfo.url,
                tabInfo.title
              );
              
              if (contentResult && contentResult.success) {
                // 세션 업데이트
                newSession.images = contentResult.images || [];
                newSession.summaryTopic = contentResult.summary.topic || "";
                newSession.summaryPoints = contentResult.summary.points || [];
                newSession.summaryCategory = contentResult.summary.category || "";
                
                console.log("[NEW SESSION] Summary generated successfully");
                console.log("[SUMMARY] Topic:", newSession.summaryTopic);
              } else {
                newSession.extractionError = contentResult?.extractionError || {
                  message: "Failed to extract content",
                  url: tabInfo.url,
                  timestamp: new Date().toISOString(),
                  attempts: 0
                };
                console.error("[EXTRACT] Content extraction failed:", newSession.extractionError);
              }
            } catch (error) {
              newSession.extractionError = {
                message: error.message || "Unknown error during extraction",
                url: tabInfo.url,
                timestamp: new Date().toISOString(),
                attempts: 0
              };
              console.error("[EXTRACT] Error during content extraction:", newSession.extractionError);
            }
          } else {
            console.log("[NEW SESSION] Inactive session or missing tab ID, no AI summarization needed");
          }
          
          // 새 세션 저장 - Firebase에 먼저 저장
          try {
            newSession.firebaseId = await saveSessionToFirebase(newSession);
            console.log("[NEW SESSION] Saved to Firebase:", newSession.firebaseId);
          } catch (error) {
            console.error("[NEW SESSION] Error saving to Firebase:", error);
          }
          
          // 로컬 스토리지에도 저장
          sessions.push(newSession);
          
          console.log("[NEW SESSION] Created:", newSession.id, "Type:", newSession.sessionType);
        }

        // 로컬 스토리지 업데이트
        chrome.storage.local.set({ focusSessions: sessions }, () => {
          console.log("[STORAGE] Sessions saved. Total:", sessions.length);
          // 가장 최근 세션 (새로 생성된 세션 또는 병합된 세션) 로그 출력
          const latestSession = sessions[sessions.length - 1];
          console.log("[SESSION PREVIEW]", JSON.stringify(latestSession, null, 2));
        });
      });
    });

    activeStartTime = null;
  }
}, 5000);