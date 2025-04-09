let lastActivityTime = Date.now();
let activeStartTime = null;
const ACTIVE_SESSION_THRESHOLD = 15 * 1000;

let eventCounter = {
  mousemove: 0,
  click: 0,
  keydown: 0
};

let senderURLCache = null;

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

chrome.runtime.onInstalled.addListener(() => {
  console.log("FocusTrack installed!");

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      // ✅ 확장 권한이 적용되는 URL만 필터링
      const validURL = tab.url && tab.url.startsWith("http");

      if (tab.id && validURL) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        }).catch((err) => {
          console.warn(`Could not inject content.js into tab ${tab.url}`, err);
        });
      }
    });
  });
});

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
          startTime,
          endTime,
          duration,
          sessionType,
          url,
          title,
          domain,
          eventCount: { ...eventCounter }
        };

        console.log("[SESSION END]", sessionData);

        // ⚠️ Wait until storage API is definitely available
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
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