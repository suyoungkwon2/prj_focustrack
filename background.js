// ✅ 세션 임시 저장 후 Gemini 요약 결과로 업데이트하는 구조로 리팩토링

let lastActivityTime = Date.now();
let activeStartTime = null;
const ACTIVE_SESSION_THRESHOLD = 15 * 1000;

let eventCounter = {
  mousemove: 0,
  click: 0,
  keydown: 0
};

let senderURLCache = null;

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().replace("T", " ").substring(0, 19);
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

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const tabInfo = {
        id: tab?.id,
        url: tab?.url || fallbackURL,
        title: tab?.title || "Unknown Page"
      };

      const sessionData = {
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
        fullExtractedText: ""
      };

      console.log("[SESSION END]", sessionData);

      // Step 1: Store raw session first
      chrome.storage.local.get(["focusSessions"], (result) => {
        const sessions = result.focusSessions || [];
        sessions.push(sessionData);
        chrome.storage.local.set({ focusSessions: sessions, lastSessionUrl: tabInfo.url }, () => {
          console.log("[STORAGE] Session saved. Total sessions:", sessions.length);
        });
      });

      // Step 2: If active, get text + Gemini
      if (sessionType === "active" && tabInfo.id) {
        try {
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tabInfo.id },
            func: () => document.body.innerText
          });

          const fullExtractedText = result;

          console.log("[GEMINI] Extracted body text length:", result.length);
          console.log("[GEMINI] Preview of body text:", result.slice(0, 100));

          chrome.storage.local.set({ lastPageExtractedText: result });

          const aiResult = await summarizeWithGemini({ url: tabInfo.url, title: tabInfo.title, bodyText: result });
          console.log("[GEMINI] Full response text:", aiResult);

          const topicMatch = aiResult.match(/Main Topic\s*[:\-]?\s*(.*)/i);
          const bulletMatch = aiResult.match(/Key Points\s*[:\-]?\s*([\s\S]*?)Category/i);
          const categoryMatch = aiResult.match(/Category\s*[:\-]?\s*(.*)/i);

          const summaryTopic = topicMatch?.[1]?.trim() || "";
          const summaryPoints = bulletMatch?.[1]?.trim().split("\n").filter(Boolean) || [];
          const summaryCategory = categoryMatch?.[1]?.trim() || "";

          chrome.storage.local.get(["focusSessions", "lastSessionUrl"], (result) => {
            const sessions = result.focusSessions || [];
            const updated = sessions.map((s) => {
              if (s.url === result.lastSessionUrl) {
                return {
                  ...s,
                  summaryTopic,
                  summaryPoints,
                  summaryCategory,
                  fullExtractedText
                };
              } else {
                return s;
              }
            });
            chrome.storage.local.set({ focusSessions: updated }, () => {
              console.log("[GEMINI] Session updated with summary:", summaryTopic);
            });
          });
        } catch (e) {
          console.error("[GEMINI] Summarization failed:", e);
        }
      }
    });

    activeStartTime = null;
  }
}, 5000);
