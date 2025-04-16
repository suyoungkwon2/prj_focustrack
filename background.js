// background.js (정제된 안정버전 + Gemini 요약 기능 포함)

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

async function summarizeWithGemini({ url, title, bodyText }) {
  try {
    const GEMINI_API_KEY = "AIzaSyCsfpWTHI36q2CI-1BQqc95WXN38kTPv1A"; // Gemini 2.0 Flash
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
              last.fullExtractedText = fullText;

              console.log("[GEMINI] Updated merged session:", last.id);
            } catch (e) {
              console.error("[GEMINI] Summarization failed (merged session):", e);
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
            fullExtractedText: "",
            segments: [{ start: startTime, end: endTime }]
          };

          sessions.push(session);
          console.log("[STORAGE] New session added:", session.id);

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
              session.fullExtractedText = fullText;

              console.log("[GEMINI] Updated session with summary:", session.summaryTopic);
            } catch (e) {
              console.error("[GEMINI] Summarization failed (new session):", e);
            }
          }
        }

        chrome.storage.local.set({ focusSessions: sessions }, () => {
          console.log("[STORAGE] Sessions saved. Total:", sessions.length);
          console.log("[SESSION PREVIEW]", JSON.stringify(session, null, 2));
        });
      });
    });

    activeStartTime = null;
  }
}, 5000);

