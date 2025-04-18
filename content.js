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

function extractImportantImages() {
  const images = Array.from(document.querySelectorAll('img')).filter(img => {
    // 최소 크기 이상의 이미지만 수집 (작은 아이콘 제외)
    const rect = img.getBoundingClientRect();
    return rect.width >= 200 && rect.height >= 150 && img.src;
  }).map(img => ({
    url: img.src,
    alt: img.alt || '',
    width: img.width,
    height: img.height
  }));
  
  return images.slice(0, 5); // 최대 5개 이미지만 저장
}

["mousemove", "keydown", "click"].forEach((event) => {
  document.addEventListener(event, () => reportActivity(event), { passive: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'extractContent') {
        const bodyText = document.body.innerText;
        const images = Array.from(document.querySelectorAll('img'))
            .filter(img => {
                const rect = img.getBoundingClientRect();
                return img.src && 
                       img.complete && 
                       rect.width >= 200 && 
                       rect.height >= 150 && 
                       img.src.startsWith('http') && 
                       !img.src.includes('data:');
            })
            .slice(0, 5)
            .map(img => ({
                url: img.src,
                alt: img.alt || '',
                width: img.width,
                height: img.height
            }));

        sendResponse({ bodyText, images });
    }
    return true;
});