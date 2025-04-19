import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { siteAnalysisPrompt } from "../prompts/site-analysis.js";
import dotenv from "dotenv";
import { Client } from "langsmith";
import { LangChainTracer } from "langchain/callbacks";

dotenv.config();

// LangSmith 클라이언트 초기화
const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
  endpoint: process.env.LANGSMITH_ENDPOINT,
});

const PROJECT_ID = "2025focustrack";

// LangSmith 트레이서 초기화
const tracer = new LangChainTracer({
  projectName: PROJECT_ID,
});

console.log("Starting tests...");
console.log("API Key:", process.env.GEMINI_API_KEY ? "Found" : "Not found");
console.log("LangSmith Project ID:", PROJECT_ID);
console.log("LangSmith Tracing:", process.env.LANGSMITH_TRACING);

const testCases = [
  {
    url: "https://www.youtube.com/watch?v=example1",
    title: "Introduction to Quantum Computing",
    content: "This video explains the basics of quantum computing, including qubits, superposition, and quantum gates. It's part of a series on advanced computer science topics.",
    expectedCategory: "Growth",
  },
  {
    url: "https://www.amazon.com/product/example2",
    title: "Grocery Shopping List",
    content: "Weekly grocery shopping list including fresh produce, dairy products, and household essentials.",
    expectedCategory: "Daily Life",
  },
  {
    url: "https://www.netflix.com/watch=example3",
    title: "Popular TV Show Episode",
    content: "Latest episode of a popular TV series with dramatic plot twists and character development.",
    expectedCategory: "Entertainment",
  },
];

async function runTests() {
  console.log("\nInitializing model...");
  const model = new ChatGoogleGenerativeAI({
    modelName: "gemini-1.5-flash",
    apiKey: process.env.GEMINI_API_KEY,
    callbacks: [tracer],
  });

  for (const testCase of testCases) {
    try {
      console.log("\nTesting URL:", testCase.url);
      
      const prompt = await siteAnalysisPrompt.format({
        url: testCase.url,
        title: testCase.title,
        content: testCase.content,
      });
      console.log("Formatted prompt. Calling API...");

      const response = await model.invoke(prompt);

      console.log("\nTest Case:", testCase.url);
      console.log("Expected Category:", testCase.expectedCategory);
      console.log("Response:\n", response);

      // 카테고리 매칭 확인
      const categoryMatch = response.content.includes(`Category: ${testCase.expectedCategory}`);
      console.log(categoryMatch ? "✅ Category match" : "❌ Category mismatch");
      
    } catch (error) {
      console.error("Error in test case:", testCase.url);
      console.error(error);
    }
  }
}

console.log("Running tests...");
runTests().catch(console.error); 