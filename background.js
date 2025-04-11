// background.js (with UUID, segments, merge logging + session preview)

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

        if (isMergeable) {
          console.log("[MERGE] with previous session:", last.id);
          last.endTime = endTime;
          last.endTimeFormatted = formatTime(endTime);
          last.duration += duration;
          last.eventCount.mousemove += eventCounter.mousemove;
          last.eventCount.click += eventCounter.click;
          last.eventCount.keydown += eventCounter.keydown;
          last.segments.push({ start: startTime, end: endTime });
        } else {
          const newSession = {
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
          sessions.push(newSession);
          console.log("[STORAGE] New session added:", newSession.id);
        }

        chrome.storage.local.set({ focusSessions: sessions }, () => {
          console.log("[STORAGE] Sessions saved. Total:", sessions.length);
          const latest = sessions[sessions.length - 1];
          console.log("[SESSION PREVIEW]", JSON.stringify(latest, null, 2));
        });
      });
    });

    activeStartTime = null;
  }
}, 5000);