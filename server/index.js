const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 4000;

const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(bodyParser.json());

app.post("/summarize", async (req, res) => {
  try {
    const { url, title, bodyText } = req.body;
    const trimmedText = bodyText.slice(0, 10000);

    const prompt = `You are an assistant that analyzes web pages for user focus tracking.\n\nBased on the following webpage information — including the URL, title, and full document body text — perform the following tasks:\n\n1. Summarize the main topic of the webpage in one concise sentence.\n\n2. Provide 3 to 5 bullet points highlighting the key content of the page.\n\n3. Classify the likely user intent or purpose for visiting this webpage, based entirely on its actual content, not the URL or domain.\nChoose one of the following categories:\n- Growth: Lecture materials, academic research, coding, study-related resources\n- Productivity: Emails, calendar, assignment submissions, team collaboration\n- Daily Life: General searches, news, health-related queries\n- Entertainment: Social networks, videos, gaming, music, online shopping\n\nIf the page has no meaningful content, say clearly: \"[NO CONTENT]\".\nIf the content is valid, always answer all 3 questions.\n\n---\nURL: ${url}\nTitle: ${title}\nContent:\n${trimmedText}`;
    console.log("[CLAUDE SERVER] Final Prompt →\\n", prompt.slice(0, 300), "..."); // 앞 300자만

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-3-opus-20240229",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1024
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("[SERVER ERROR]", error);
    res.status(500).json({ error: "Failed to connect to Claude API" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Claude proxy server running at http://localhost:${PORT}`);
});