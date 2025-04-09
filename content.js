function logActiveEvent(type) {
    chrome.runtime.sendMessage({
      action: "userActivity",
      eventType: type,
      url: window.location.href,
      timestamp: Date.now()
    });
  }
  
  ["mousemove", "keydown", "scroll", "click"].forEach(eventType => {
    window.addEventListener(eventType, () => logActiveEvent(eventType), { passive: true });
  });
  
  document.addEventListener("visibilitychange", () => {
    logActiveEvent(document.visibilityState === "visible" ? "tab_focus" : "tab_blur");
  });
  
  window.addEventListener("focus", () => logActiveEvent("window_focus"));
  window.addEventListener("blur", () => logActiveEvent("window_blur"));

  