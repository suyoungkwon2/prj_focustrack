import { PromptTemplate } from '@langchain/core/prompts';

// Prompt template for group summarization and keyword extraction (AI Call 2)

const summarizationTemplate = `You are an expert analyst tasked with summarizing a group of related web browsing sessions.

Input:
You will receive a JSON string representing a list of sessions belonging to the same semantic group. Each session object contains:
- summaryTopic: A concise topic summarizing the session's content.
- summaryPoints: Key bullet points extracted from the session.
- duration: The time spent during the session in seconds.

Task:
Based *only* on the provided session information for this group:
1.  **classifiedTopic:** Generate a single, concise, and informative topic (max 40 characters) that accurately represents the central theme of the *entire group*. Prioritize the most prominent concepts.
2.  **classifiedSummary:** Create a summary of the group's content using 3 to 5 bullet points. Synthesize the key information from the combined sessions.
3.  **classifiedKeywords:** Extract a list of up to 10 relevant keywords that best represent the group's topics.

Weighting: Give slightly more importance to information from sessions with a longer 'duration' when generating the topic, summary, and keywords.

Output Format:
Return ONLY a single, valid JSON object containing the keys "classifiedTopic", "classifiedSummary" (as an array of strings), and "classifiedKeywords" (as an array of strings). Do not include explanations or markdown.

Example Output:
{{
  "classifiedTopic": "Firebase Data Management",
  "classifiedSummary": [
    "Explored BigQuery integration for exporting raw Firebase data.",
    "Viewed user session data within the Firestore console.",
    "Focused on Firebase tools for data analysis and viewing."
  ],
  "classifiedKeywords": ["Firebase", "BigQuery", "Firestore", "Data Export", "Session Data", "Analysis", "Console"]
}}

Session Group Data (JSON String):
{session_group_json}
`;

const summarizationPrompt = new PromptTemplate({
  template: summarizationTemplate,
  inputVariables: ["session_group_json"],
});

export default summarizationPrompt; 