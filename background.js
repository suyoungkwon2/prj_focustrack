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

// Gemini API 요약 함수는 그대로 유지
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
      segments: session.segments
    });
    
    console.log("[FIREBASE] Session updated:", session.firebaseId);
    return true;
  } catch (error) {
    console.error("[FIREBASE] Error updating session:", error);
    return false;
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

          // 병합 후 active 조건 충족 시 AI 호출
          if (last.sessionType === "inactive" && last.duration >= ACTIVE_SESSION_THRESHOLD / 1000) {
            last.sessionType = "active";
            try {
              const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId: tabInfo.id },
                func: () => document.body.innerText
              });
              const fullText = result;
              const aiResult = await summarizeWithGemini({ url: tabInfo.url, title: tabInfo.title, bodyText: fullText });

              const topicMatch = aiResult.match(/Main Topic\s*[:\-]?\s*(.*)/i);
              const bulletMatch = aiResult.match(/Key Points\s*[:\-]?\s*([\s\S]*?)Category/i);
              const categoryMatch = aiResult.match(/Category\s*[:\-]?\s*(.*)/i);

              last.summaryTopic = topicMatch?.[1]?.trim() || "";
              last.summaryPoints = bulletMatch?.[1]?.trim().split("\n").filter(Boolean) || [];
              last.summaryCategory = categoryMatch?.[1]?.trim() || "";
              
              // Firebase에 업데이트
              if (last.firebaseId) {
                await updateSessionInFirebase(last);
              } else {
                last.firebaseId = await saveSessionToFirebase(last);
              }

              console.log("[GEMINI] Updated merged session:", last.id);
            } catch (e) {
              console.error("[GEMINI] Summarization failed (merged session):", e);
            }
          } else {
            // Firebase에 병합된 세션 업데이트
            if (last.firebaseId) {
              await updateSessionInFirebase(last);
            }
          }

          session = last;
        } else {
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
            segments: [{ start: startTime, end: endTime }]
          };

          // 새 세션 저장 - Firebase에 먼저 저장
          session.firebaseId = await saveSessionToFirebase(session);
          
          // 로컬 스토리지에도 저장
          sessions.push(session);

          // Active 세션인 경우 AI 요약 진행
          if (sessionType === "active" && tabInfo.id) {
            try {
              const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId: tabInfo.id },
                func: () => document.body.innerText
              });
              const fullText = result;
              const aiResult = await summarizeWithGemini({ url: tabInfo.url, title: tabInfo.title, bodyText: fullText });

              const topicMatch = aiResult.match(/Main Topic\s*[:\-]?\s*(.*)/i);
              const bulletMatch = aiResult.match(/Key Points\s*[:\-]?\s*([\s\S]*?)Category/i);
              const categoryMatch = aiResult.match(/Category\s*[:\-]?\s*(.*)/i);

              session.summaryTopic = topicMatch?.[1]?.trim() || "";
              session.summaryPoints = bulletMatch?.[1]?.trim().split("\n").filter(Boolean) || [];
              session.summaryCategory = categoryMatch?.[1]?.trim() || "";
              
              // Firebase에 업데이트된 정보 저장
              if (session.firebaseId) {
                await updateSessionInFirebase(session);
              }

              console.log("[GEMINI] Updated session with summary:", session.summaryTopic);
            } catch (e) {
              console.error("[GEMINI] Summarization failed (new session):", e);
            }
          }
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