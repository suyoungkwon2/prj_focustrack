import { classifySessions } from '../../features/classification/classifySessions.js';

// Sample session data with actual IDs
const sampleSessions = [
    { id: "4ede5a8b-a44e-432b-931a-886b8922cc55", summaryTopic: "This page details the Firebase Console's BigQuery integration settings...", duration: 183 },
    { id: "2af06e15-98bc-4d3b-aa16-622982a45dcd", summaryTopic: "This Firebase Console page displays data related to user focus sessions...", duration: 35 },
    { id: "9dd84390-01ca-41d5-a49a-efa786addf0f", summaryTopic: "This Google Cloud Console page displays the usage quotas and limits for the Generative Language API (Gemini API)...", duration: 60 },
    { id: "257fcdcf-44af-42d3-9a29-94ea542a98e0", summaryTopic: "OpenAI is offering a free ChatGPT Plus subscription to college students...", duration: 30 },
    { id: "3b78696e-4949-43a4-b60d-727b4e582b0c", summaryTopic: "Claude Code is an agentic coding tool by Anthropic that helps developers code faster...", duration: 20 }
];

// Immediately Invoked Function Expression (IIFE) to run the test
(async () => {
    console.log('--- Starting classifySessions Test ---');
    console.log('Input Sessions (ID, Topic, Duration):', JSON.stringify(sampleSessions.map(s => ({ id: s.id, topic: s.summaryTopic, duration: s.duration })), null, 2));

    try {
        const groupedIds = await classifySessions(sampleSessions);

        if (groupedIds === null) {
            console.error('--- Test Failed: classifySessions returned null (indicating an error) ---');
        } else if (Array.isArray(groupedIds)) {
            console.log('--- Test Successful ---');
            console.log('Output Grouped IDs:', JSON.stringify(groupedIds, null, 2));
            console.log(`Number of groups created: ${groupedIds.length}`);
        } else {
            console.error('--- Test Failed: classifySessions returned an unexpected type:', typeof groupedIds, groupedIds);
        }
    } catch (error) {
        console.error('--- Test Crashed ---');
        console.error('Error during classifySessions test:', error);
    }
})(); 