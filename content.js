function reportActivity(eventType) {
  try {
    chrome.runtime.sendMessage({
      action: "userActivity",
      eventType: eventType,
      url: window.location.href,
      timestamp: Date.now()
    });
  } catch (err) {
    console.warn("[CONTENT] Failed to send message:", err);
  }
}

["mousemove", "keydown", "click"].forEach((event) => {
  document.addEventListener(event, () => reportActivity(event), { passive: true });
});
