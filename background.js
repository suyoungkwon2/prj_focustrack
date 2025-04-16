// background.js
import { db, collection, addDoc, doc, updateDoc } from './firebase-config.js';

let lastActivityTime = Date.now();
let activeStartTime = null;
const ACTIVE_SESSION_THRESHOLD = 15 * 1000;
const MERGE_WINDOW = 10 * 60 * 1000;

let eventCounter = { mousemove: 0, click: 0, keydown: 0 };
let senderURLCache = null;

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().replace("T", " ").substring(0, 19);
}

function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// Gemini API 요약 함수
async function summarizeWithGemini({ url, title, bodyText }) {
  try {
    const GEMINI_API_KEY = "AIzaSyCsfpWTHI36q2CI-1BQqc95WXN38kTPv1A";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `You are an assistant that analyzes web pages for user focus tracking.\n\nBased on the following webpage information — including the URL, title, and full document body text — perform the following tasks:\n\n1. Main Topic: [Summarize the main topic of the webpage in one concise sentence]\n\n2. Key Points: [Provide 3 to 5 bullet points]\n\n3. Category: [Choose one of: Growth / Productivity / Daily Life / Entertainment]\n\n---\nURL: ${url}\nTitle: ${title}\nContent:\n${bodyText.slice(0, 10000)}`;

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
    console.log("[GEMINI] Summary received:", result);
    return result?.candidates?.[0]?.content?.parts?.[0]?.text || "[No summary returned]";
  } catch (error) {
    console.error("[GEMINI] API call failed:", error);
    return "[Gemini API error]";
  }
}

// Firebase에 세션 저장 함수
async function saveSessionToFirebase(session) {
  try {
    // 문서 ID 자동 생성을 위해 addDoc 사용
    const docRef = await addDoc(collection(db, "focusSessions"), session);
    console.log("[FIREBASE] Session saved with ID:", docRef.id);
    
    // Firebase 문서 ID를 세션에 저장 (업데이트 용도)
    session.firebaseId = docRef.id;
    
    // 로컬 스토리지에도 Firebase ID 저장 (선택사항)
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
    // firebaseId를 사용하여 문서 참조 생성
    const sessionRef = doc(db, "focusSessions", session.firebaseId);
    
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
      images: session.images || [] // 이미지 정보 추가
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
      // 텍스트 및 이미지 추출
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
      
      const fullText = result.bodyText;
      const pageImages = result.images || [];
      
      // Gemini API 호출
      const aiResult = await summarizeWithGemini({ 
        url: url, 
        title: title, 
        bodyText: fullText 
      });
      
      const topicMatch = aiResult.match(/Main Topic\s*[:\-]?\s*(.*)/i);
      const bulletMatch = aiResult.match(/Key Points\s*[:\-]?\s*([\s\S]*?)Category/i);
      const categoryMatch = aiResult.match(/Category\s*[:\-]?\s*(.*)/i);
      
      return {
        success: true,
        fullText,
        images: pageImages,
        summary: {
          topic: topicMatch?.[1]?.trim() || "",
          points: bulletMatch?.[1]?.trim().split("\n").filter(Boolean) || [],
          category: categoryMatch?.[1]?.trim() || ""
        }
      };
    } catch (error) {
      attempts++;
      console.error(`[EXTRACT] Attempt ${attempts} failed:`, error);
      
      if (attempts >= maxAttempts) {
        return {
          success: false,
          error: error.message || "Unknown error"
        };
      }
      
      // 재시도 전 대기
      await new Promise(resolve => setTimeout(resolve, 2000));
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

      chrome.storage.local.get(["focusSessions"], async (res) => {
        const sessions = res.focusSessions || [];
        const last = sessions[sessions.length - 1];
        const isMergeable =
          last &&
          last.url === tabInfo.url &&
          endTime - last.endTime <= MERGE_WINDOW;

        let session = null;
        if (isMergeable) {
          console.log("[MERGE] with previous session:", last.id);
          last.endTime = endTime;
          last.endTimeFormatted = formatTime(endTime);
          last.duration += duration;
          last.eventCount.mousemove += eventCounter.mousemove;
          last.eventCount.click += eventCounter.click;
          last.eventCount.keydown += eventCounter.keydown;
          last.segments.push({ start: startTime, end: endTime });

          // 병합 후 active 조건 충족 시 AI 호출 및 이미지 추출
          if (last.sessionType === "inactive" && last.duration >= ACTIVE_SESSION_THRESHOLD / 1000) {
            last.sessionType = "active";
            
            // 콘텐츠 추출 및 AI 요약
            const contentResult = await extractContentAndSummarize(
              tabInfo.id,
              tabInfo.url,
              tabInfo.title
            );
            
            if (contentResult.success) {
              // 세션 업데이트
              last.images = contentResult.images;
              last.summaryTopic = contentResult.summary.topic;
              last.summaryPoints = contentResult.summary.points;
              last.summaryCategory = contentResult.summary.category;
              
              // Firebase에 업데이트
              if (last.firebaseId) {
                await updateSessionInFirebase(last);
              } else {
                last.firebaseId = await saveSessionToFirebase(last);
              }
              
              console.log("[GEMINI] Updated merged session:", last.id);
              console.log("[IMAGES] Extracted images:", contentResult.images.length);
            } else {
              console.error("[EXTRACT] Failed to extract content:", contentResult.error);
            }
          } else {
            // Firebase에 병합된 세션 업데이트
            if (last.firebaseId) {
              await updateSessionInFirebase(last);
            }
          }

          session = last;
        } else {
          // 새 세션 생성
          session = {
            id: generateUUID(),
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
            images: [] // 이미지 배열 추가
          };
          
          // Active 세션인 경우 AI 요약 및 이미지 추출 진행
          if (sessionType === "active" && tabInfo.id) {
            // 콘텐츠 추출 및 AI 요약
            const contentResult = await extractContentAndSummarize(
              tabInfo.id,
              tabInfo.url,
              tabInfo.title
            );
            
            if (contentResult.success) {
              // 세션 업데이트
              session.images = contentResult.images;
              session.summaryTopic = contentResult.summary.topic;
              session.summaryPoints = contentResult.summary.points;
              session.summaryCategory = contentResult.summary.category;
            } else {
              console.error("[EXTRACT] Failed to extract content:", contentResult.error);
            }
          }
          
          // 새 세션 저장 - Firebase에 먼저 저장
          session.firebaseId = await saveSessionToFirebase(session);
          
          // 로컬 스토리지에도 저장
          sessions.push(session);
        }

        // 로컬 스토리지 업데이트
        chrome.storage.local.set({ focusSessions: sessions }, () => {
          console.log("[STORAGE] Sessions saved. Total:", sessions.length);
          console.log("[SESSION PREVIEW]", JSON.stringify(session, null, 2));
        });
      });
    });

    activeStartTime = null;
  }
}, 5000);