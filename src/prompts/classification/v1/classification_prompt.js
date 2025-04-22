import { PromptTemplate } from '@langchain/core/prompts';

// Prompt template for session classification (AI Call 1)

const classificationTemplate = `Analyze the following JSON list of web sessions. Group the sessions based on the semantic similarity of their 'summaryTopic', giving higher weight to sessions with a larger 'duration'.

Return ONLY a valid JSON list of lists, where each inner list contains the string IDs of the sessions belonging to a single group. Do not include any other text, explanations, or markdown formatting.

Example of expected output format: [[id1, id5], [id2, id8], [id3]]

Session List JSON:
{session_list_json}
`;

const classificationPrompt = new PromptTemplate({
  template: classificationTemplate,
  inputVariables: ["session_list_json"],
});

export default classificationPrompt; 