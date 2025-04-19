// youtubedataextraction.js

const YOUTUBE_API_KEY = "AIzaSyApzlSg2LA40BxQwLT_-hDoURso5A4HVcs"; // Replace this with your actual YouTube API key

export function isYouTubeVideo(url) {
  return url.includes("youtube.com/watch?v=") || 
         url.includes("youtu.be/") || 
         url.includes("youtube.com/shorts/");
}

export function extractVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    
    // 일반 YouTube 영상
    if (parsedUrl.hostname.includes("youtube.com") && parsedUrl.searchParams.has("v")) {
      return parsedUrl.searchParams.get("v");
    }
    
    // Shorts URL
    if (parsedUrl.hostname.includes("youtube.com") && parsedUrl.pathname.startsWith("/shorts/")) {
      return parsedUrl.pathname.split("/shorts/")[1];
    }
    
    // youtu.be URL
    if (parsedUrl.hostname === "youtu.be") {
      return parsedUrl.pathname.slice(1);
    }
    
    return null;
  } catch (error) {
    console.error("Invalid URL:", url);
    return null;
  }
}

export function isExtractableUrl(url) {
  try {
    const parsedUrl = new URL(url);
    
    // 추출 불가능한 URL 스키마
    const blockedSchemes = ['chrome:', 'about:', 'chrome-extension:', 'file:', 'data:'];
    if (blockedSchemes.some(scheme => url.startsWith(scheme))) {
      return false;
    }
    
    // YouTube 영상인 경우 항상 추출 가능
    if (isYouTubeVideo(url)) {
      return true;
    }
    
    // 일반 웹사이트의 경우 도메인이 있는지 확인
    return parsedUrl.hostname.length > 0;
  } catch (error) {
    return false;
  }
}

export async function fetchVideoMetadata(videoId) {
  try {
    console.log("[YOUTUBE] Fetching metadata for video ID:", videoId);
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    console.log("[YOUTUBE] API URL:", apiUrl);
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    console.log("[YOUTUBE] API Response:", data);

    if (data.items && data.items.length > 0) {
      const video = data.items[0].snippet;
      const content = data.items[0].contentDetails;
      const result = {
        title: video.title,
        description: video.description,
        tags: video.tags || [],
        captionsEnabled: content.caption === "true"
      };
      console.log("[YOUTUBE] Extracted metadata:", result);
      return result;
    } else {
      console.error("[YOUTUBE] No video metadata found in response");
      throw new Error("No video metadata found");
    }
  } catch (error) {
    console.error("[YOUTUBE] Failed to fetch metadata:", error.message);
    return {
      title: null,
      description: null,
      tags: [],
      captionsEnabled: false
    };
  }
}

export async function fetchCaptions(videoId) {
  try {
    console.log("[YOUTUBE] Fetching captions for video ID:", videoId);
    const watchPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log("[YOUTUBE] Watch page URL:", watchPageUrl);
    
    const res = await fetch(watchPageUrl);
    const html = await res.text();
    console.log("[YOUTUBE] Watch page HTML length:", html.length);

    const captionTrackMatch = html.match(/"captionTracks":(\[.*?\])/);
    if (!captionTrackMatch) {
      console.error("[YOUTUBE] No caption tracks found in HTML");
      throw new Error("No caption tracks found");
    }

    const tracks = JSON.parse(captionTrackMatch[1]);
    console.log("[YOUTUBE] Found caption tracks:", tracks.length);
    
    const preferredLangs = ["ko", "en"];
    const track = preferredLangs
      .map(lang => tracks.find(t => t.languageCode === lang))
      .find(t => t);

    if (!track) {
      console.error("[YOUTUBE] No suitable caption track found for languages:", preferredLangs);
      throw new Error("No suitable caption track found");
    }

    console.log("[YOUTUBE] Using caption track:", track.languageCode);
    const xmlRes = await fetch(track.baseUrl);
    const xmlText = await xmlRes.text();
    console.log("[YOUTUBE] Caption XML length:", xmlText.length);

    const entries = [...xmlText.matchAll(/<text.+?>(.*?)<\/text>/g)];
    const cleaned = entries.map(e =>
      e[1]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\n/g, " ")
    );

    const result = cleaned.join(" ");
    console.log("[YOUTUBE] Extracted captions length:", result.length);
    return result;
  } catch (error) {
    console.error("[YOUTUBE] No transcript available:", error.message);
    return null;
  }
}

export async function analyzeYouTubeVideo(videoUrl) {
  console.log("[YOUTUBE] Analyzing video URL:", videoUrl);
  const videoId = extractVideoId(videoUrl);
  console.log("[YOUTUBE] Extracted video ID:", videoId);
  
  if (!videoId) {
    console.error("[YOUTUBE] Failed to extract video ID from URL");
    return null;
  }

  const metadata = await fetchVideoMetadata(videoId);
  const captions = await fetchCaptions(videoId);

  const result = {
    videoId,
    title: metadata.title || null,
    description: metadata.description || null,
    tags: metadata.tags || [],
    captionsEnabled: metadata.captionsEnabled || false,
    captions,
  };
  
  console.log("[YOUTUBE] Final analysis result:", result);
  return result;
}