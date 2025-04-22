import { classifySessions } from '../../features/classification/classifySessions.js';

// Sample session data
const sampleSessions = [
    { id: "s1", summaryTopic: "Firebase BigQuery Integration", duration: 180 },
    { id: "s2", summaryTopic: "Firebase Firestore Data Viewer", duration: 35 },
    { id: "s3", summaryTopic: "Google Cloud Gemini API Quotas", duration: 60 },
    { id: "s4", summaryTopic: "OpenAI ChatGPT Plus Free for Students", duration: 30 },
    { id: "s5", summaryTopic: "Anthropic Claude Code Agent Tool", duration: 20 }
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