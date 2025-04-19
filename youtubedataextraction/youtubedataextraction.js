// youtubedataextraction.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const YOUTUBE_API_KEY = "AIzaSyApzlSg2LA40BxQwLT_-hDoURso5A4HVcs"; // Replace this with your actual YouTube API key

function isYouTubeVideo(url) {
  return url.includes("youtube.com/watch?v=") || url.includes("youtu.be/");
}

function extractVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("youtube.com") && parsedUrl.searchParams.has("v")) {
      return parsedUrl.searchParams.get("v");
    }
    if (parsedUrl.hostname === "youtu.be") {
      return parsedUrl.pathname.slice(1);
    }
    return null;
  } catch (error) {
    console.error("Invalid URL:", url);
    return null;
  }
}

async function fetchVideoMetadata(videoId) {
  try {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const video = data.items[0].snippet;
      const content = data.items[0].contentDetails;
      return {
        title: video.title,
        description: video.description,
        tags: video.tags || [],
        captionsEnabled: content.caption === "true"
      };
    } else {
      throw new Error("No video metadata found");
    }
  } catch (error) {
    console.error("Failed to fetch metadata:", error.message);
    return {
      title: null,
      description: null,
      tags: [],
      captionsEnabled: false
    };
  }
}

async function fetchCaptions(videoId) {
  try {
    const watchPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(watchPageUrl);
    const html = await res.text();

    const captionTrackMatch = html.match(/"captionTracks":(\[.*?\])/);
    if (!captionTrackMatch) throw new Error("No caption tracks found");

    const tracks = JSON.parse(captionTrackMatch[1]);
    const preferredLangs = ["ko", "en"];

    const track = preferredLangs
      .map(lang => tracks.find(t => t.languageCode === lang))
      .find(t => t);

    if (!track) throw new Error("No suitable caption track found");

    const xmlRes = await fetch(track.baseUrl);
    const xmlText = await xmlRes.text();

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

    return cleaned.join(" ");
  } catch (error) {
    console.error("No transcript available:", error.message);
    return null;
  }
}

async function analyzeYouTubeVideo(videoUrl) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return null;

  const metadata = await fetchVideoMetadata(videoId);
  const captions = await fetchCaptions(videoId);

  return {
    videoId,
    title: metadata.title || null,
    description: metadata.description || null,
    tags: metadata.tags || [],
    captionsEnabled: metadata.captionsEnabled || false,
    captions,
  };
}

module.exports = {
  analyzeYouTubeVideo,
  extractVideoId,
  fetchVideoMetadata,
  fetchCaptions,
};
