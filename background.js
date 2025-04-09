// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === "getHistory") {
//     chrome.history.search({
//       text: '',
//       startTime: Date.now() - (24 * 60 * 60 * 1000), // past 24 hours
//       maxResults: 10
//     }, function(results) {
//       results.forEach((page) => {
//         console.log('--- Visited Page ---');
//         console.log('URL:', page.url);
//         console.log('Title:', page.title);
//         console.log('Last Visit:', new Date(page.lastVisitTime).toLocaleString());
//         console.log('Visit Count:', page.visitCount);
//         console.log('Typed Count:', page.typedCount);
//       });
//     });
//   }
// });

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === "getHistory") {
//     chrome.history.search({
//       text: '',
//       startTime: Date.now() - (24 * 60 * 60 * 1000), // past 24 hours
//       maxResults: 5
//     }, function(results) {
//       results.forEach((page) => {
//         console.log('--- Visited Page ---');
//         console.log('URL:', page.url);
//         console.log('Title:', page.title);

//         // Get visit details for this URL
//         chrome.history.getVisits({ url: page.url }, function(visits) {
//           visits.forEach((visit) => {
//             console.log('  > Visit ID:', visit.visitId);
//             console.log('  > Visit Time:', new Date(visit.visitTime).toLocaleString());
//             console.log('  > Transition Type:', visit.transition);
//           });
//         });
//       });
//     });
//   }
// });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getHistory") {
    // (keep your old history logic here)
  }

  if (message.action === "userActivity") {
    console.log(`[ACTIVE] ${message.eventType} on ${message.url} at ${new Date(message.timestamp).toLocaleTimeString()}`);
    // Later: you can log/store this info per site per session
  }
});

let lastActivityTime = Date.now();
const IDLE_THRESHOLD = 1 * 60 * 1000; // 2 minutes

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "userActivity") {
    lastActivityTime = message.timestamp;

    // For now, just log it
    console.log(`[ACTIVE] ${message.eventType} on ${message.url} at ${new Date(message.timestamp).toLocaleTimeString()}`);
  }
});

setInterval(() => {
  const now = Date.now();
  const idleTime = now - lastActivityTime;

  if (idleTime > IDLE_THRESHOLD) {
    console.warn(`[DISTRACTED] User idle for ${Math.floor(idleTime / 1000)} seconds`);
    // You can trigger an alert or notification here
  }
}, 5000); // check every 5 seconds

let alerted = false; // prevent spamming notifications

setInterval(() => {
  const now = Date.now();
  const idleTime = now - lastActivityTime;

  if (idleTime > IDLE_THRESHOLD && !alerted) {
    alerted = true;

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png", // you can use any 128x128 image or comment this out for now
      title: "Focus Check 👀",
      message: "You've been idle for a while. Time to get back on track!",
      priority: 2
    });

    console.warn(`[ALERT] User idle for ${Math.floor(idleTime / 1000)} seconds`);
  }

  // Reset alert if user is active again
  if (idleTime < 10000) {
    alerted = false;
  }
}, 5000);

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url.startsWith("http")) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
      }
    });
  });
});
