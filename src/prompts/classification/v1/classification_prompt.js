import { PromptTemplate } from '@langchain/core/prompts';

// Prompt template for session classification (AI Call 1) - V2

const classificationTemplate = `Analyze the following JSON list of web sessions. Your goal is to identify meaningful clusters and group the sessions based on the semantic similarity of their 'summaryTopic'.

Instructions:
1. Group sessions that discuss **closely related** topics together. Aim to create meaningful clusters.
2. Use the 'duration' as a secondary factor: give slightly more weight to longer sessions when deciding borderline cases for grouping, but prioritize semantic topic similarity.
3. **Avoid creating groups with only one session unless that session's topic is truly unique and dissimilar from all others.**

Return ONLY a valid JSON list of lists, where each inner list contains the string IDs of the sessions belonging to a single group. Do not include any other text, explanations, or markdown formatting.

Example of expected output format for similar data: [["4ede5a8b-a44e-432b-931a-886b8922cc55", "2af06e15-98bc-4d3b-aa16-622982a45dcd"], ["9dd84390-01ca-41d5-a49a-efa786addf0f"], ["257fcdcf-44af-42d3-9a29-94ea542a98e0", "3b78696e-4949-43a4-b60d-727b4e582b0c"]]

Session List JSON:
{session_list_json}
`;

const classificationPrompt = new PromptTemplate({
  template: classificationTemplate,
  inputVariables: ["session_list_json"],
});

export default classificationPrompt; 