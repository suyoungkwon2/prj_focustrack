let lastActivityTime = Date.now();
let activeStartTime = null;
const ACTIVE_SESSION_THRESHOLD = 15 * 1000;

let eventCounter = {
  mousemove: 0,
  click: 0,
  keydown: 0
};

let senderURLCache = null;

// ✅ 사람이 읽기 쉬운 시간으로 포맷하는 함수
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().replace("T", " ").substring(0, 19);
}

// 사용자 활동 메시지 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "userActivity") {
    lastActivityTime = message.timestamp;

    if (message.url) {
      senderURLCache = message.url;
    }

    if (!activeStartTime) {
      activeStartTime = lastActivityTime;
      eventCounter = { mousemove: 0, click: 0, keydown: 0 };
    }

    if (eventCounter[message.eventType] !== undefined) {
      eventCounter[message.eventType]++;
    }

    console.log(`[ACTIVE] ${message.eventType} on ${message.url} at ${new Date(message.timestamp).toLocaleTimeString()}`);
  }
});

// 확장 설치 시 content.js 주입 시도
chrome.runtime.onInstalled.addListener(() => {
  console.log("FocusTrack installed!");

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      try {
        if (tab.id && tab.url && tab.url.startsWith("http")) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
          }).catch((err) => {
            console.warn(`❗️ Could not inject content.js into tab ${tab.url}`, err);
          });
        }
      } catch (err) {
        console.warn("❗️ Script injection error:", err);
      }
    });
  });
});

// 활동 기반 세션 저장
setInterval(() => {
  const now = Date.now();

  if (activeStartTime) {
    const activeDuration = now - activeStartTime;

    if (now - lastActivityTime > 5000) {
      const sessionType = activeDuration >= ACTIVE_SESSION_THRESHOLD ? "active" : "inactive";
      const startTime = activeStartTime;
      const endTime = lastActivityTime + 5000;
      const duration = Math.floor((endTime - startTime) / 1000);
      const url = senderURLCache || "unknown";
      const domain = url.split("/")[2] || "unknown";

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const title = tabs[0]?.title || "Unknown Page";

        const sessionData = {
          url,
          startTime,
          startTimeFormatted: formatTime(startTime), // ✅ 읽기 쉬운 시간 추가
          endTime,
          endTimeFormatted: formatTime(endTime),     // ✅ 읽기 쉬운 시간 추가
          duration,
          sessionType,
          title,
          domain,
          canTrackActivity: true, // ✅ 명시적 선언
          eventCount: { ...eventCounter }
        };

        console.log("[SESSION END]", sessionData);

        if (chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.get(["focusSessions"], (result) => {
              const sessions = result.focusSessions || [];
              sessions.push(sessionData);

              chrome.storage.local.set({ focusSessions: sessions }, () => {
                console.log("[STORAGE] Session saved. Total sessions:", sessions.length);
              });
            });
          } catch (e) {
            console.error("❌ Failed to store session:", e);
          }
        } else {
          console.error("❌ chrome.storage.local is not available.");
        }
      });

      activeStartTime = null;
    }
  }
}, 5000);

// 방문 기록만 수집 (content.js 주입 불가한 사이트 포함)
chrome.history.onVisited.addListener((historyItem) => {
  const url = historyItem.url;
  const domain = url.split("/")[2] || "unknown";
  const title = historyItem.title || "Untitled";
  const visitTime = historyItem.lastVisitTime;

  const passiveVisitData = {
    url,
    domain,
    title,
    visitTime,
    canTrackActivity: false,
    visitCount: 1
  };

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["passiveVisits"], (result) => {
      const visits = result.passiveVisits || [];

      const existing = visits.find(v => v.url === url);

      if (existing) {
        existing.visitCount += 1;
        existing.visitTime = visitTime;
        console.log(`[PASSIVE VISIT] Updated visit to: ${domain}, count: ${existing.visitCount}`);
      } else {
        visits.push(passiveVisitData);
        console.log(`[PASSIVE VISIT] New visit to: ${domain}`);
      }

      chrome.storage.local.set({ passiveVisits: visits }, () => {
        console.log("[PASSIVE VISIT] Saved visit to:", domain);
      });
    });
  }
});