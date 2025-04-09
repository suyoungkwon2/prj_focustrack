document.getElementById("checkHistory").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "getHistory" });
  });
  