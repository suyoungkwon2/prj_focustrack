import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import dotenv from 'dotenv';
import { summarizeGroup } from '../../features/classification/summarizeGroup.js';

dotenv.config();

// Full sample session data (extracted from docs)
const allSampleSessions = [
    // --- Group 1: Firebase --- (Based on previous classifySessions result)
    {
        "id": "4ede5a8b-a44e-432b-931a-886b8922cc55",
        "summaryTopic": "This page details the Firebase Console's BigQuery integration settings, allowing users to export and analyze raw event and user data from Firebase projects within BigQuery",
        "summaryPoints": [
            "BigQuery integration allows exporting raw, unsampled data for deeper insights",
            "The BigQuery sandbox has a 10GB storage limit affecting Firebase data exports",
            "Users can export data from Google Analytics, Crashlytics, Performance Monitoring, and Cloud Messaging to BigQuery",
            "Google Analytics event export settings can be managed within Google Analytics for finer control",
            "Users can import segment data for targeting using BigQuery"
        ],
        "duration": 183,
    },
    {
        "id": "2af06e15-98bc-4d3b-aa16-622982a45dcd",
        "summaryTopic": "This Firebase Console page displays data related to user focus sessions tracked by the \"2025FocusTrack\" project, including details like domain, duration, timestamps, and user activity",
        "summaryPoints": [
            "The page provides a table view of user focus sessions data stored in Cloud Firestore",
            "Each session includes information about the website visited, the duration of the session, and user activity events",
            "The data includes session timestamps, activity status (active/inactive), and potential summary information",
            "The data is organized by user UUID and focus session ID",
            "The table allows for querying and filtering of the data"
        ],
        "duration": 35,
    },
    // --- Group 2: Google Cloud/Gemini --- (Based on previous classifySessions result)
    {
        "id": "9dd84390-01ca-41d5-a49a-efa786addf0f",
        "summaryTopic": "This Google Cloud Console page displays the usage quotas and limits for the Generative Language API (Gemini API) for a specific project",
        "summaryPoints": [
            "The Gemini API allows developers to build generative AI applications using multimodal Gemini models",
            "The page details the quotas and system limits for various Gemini models, including request limits and token count limits",
            "Users can monitor their current usage and set up alerts to be notified when quotas are approaching their maximum",
            "The displayed quotas are specific to the free tier and are adjustable",
            "The page provides links to documentation and allows management of notification policies related to quota usage"
        ],
        "duration": 59,
    },
    // --- Group 3: AI Tools (OpenAI/Anthropic) --- (Based on previous classifySessions result)
    {
        "id": "257fcdcf-44af-42d3-9a29-94ea542a98e0",
        "summaryTopic": "OpenAI is offering a free ChatGPT Plus subscription to college students in the US and Canada until May 31st, highlighting its usefulness for studying and research",
        "summaryPoints": [
            "Students in the US and Canada are eligible for a free ChatGPT Plus subscription",
            "ChatGPT Plus can help students summarize documents, conduct research, brainstorm ideas, and practice languages",
            "The offer is valid until May 31st, after which standard rates apply unless canceled",
            "Students can upload documents, PDFs, and images for summarization and quizzing"
        ],
        "duration": 30,
    },
    {
        "id": "3b78696e-4949-43a4-b60d-727b4e582b0c",
        "summaryTopic": "Claude Code is an agentic coding tool by Anthropic that helps developers code faster by understanding their codebase and executing natural language commands in the terminal",
        "summaryPoints": [
            "Claude Code integrates directly with the development environment, streamlining workflows without requiring additional servers",
            "Key capabilities include editing files, fixing bugs, answering questions about code architecture, executing tests, and managing Git operations",
            "It operates securely by directly connecting to Anthropic's API and maintaining awareness of the project structure",
            "Users can control Claude Code with CLI commands, slash commands, and memory management features to personalize its behavior",
            "Claude Code can be used in non-interactive mode for CI/CD workflows by utilizing the `--print` flag and setting the `ANTHROPIC_API_KEY` environment variable"
        ],
        "duration": 19,
    }
    // Note: The Naver Newsstand and Amazon samples are not included as they weren't grouped in the previous step's output.
];

// Simulated result from Step 1 (classifySessions)
const groupedIds = [
    ["4ede5a8b-a44e-432b-931a-886b8922cc55", "2af06e15-98bc-4d3b-aa16-622982a45dcd"], // Firebase Group
    ["9dd84390-01ca-41d5-a49a-efa786addf0f"],                                  // Google Cloud/Gemini Group
    ["257fcdcf-44af-42d3-9a29-94ea542a98e0", "3b78696e-4949-43a4-b60d-727b4e582b0c"]  // AI Tools Group
];

// Initialize Gemini model (same as in classifySessions for consistency)
const model = new ChatGoogleGenerativeAI({
    modelName: 'gemini-1.5-pro',
    apiKey: process.env.GEMINI_API_KEY,
});

// IIFE to run the test
(async () => {
    console.log('--- Starting summarizeGroup Test ---');

    if (!process.env.GEMINI_API_KEY) {
        console.error('--- Test Failed: Gemini API key is missing. Set GEMINI_API_KEY in your .env file. ---');
        return;
    }

    let allTestsPassed = true;

    for (let i = 0; i < groupedIds.length; i++) {
        const group = groupedIds[i];
        console.log(`\n--- Testing Group ${i + 1}: [${group.join(', ')}] ---`);

        // Find the corresponding session data for the current group
        const groupData = allSampleSessions.filter(session => group.includes(session.id));

        if (groupData.length !== group.length) {
            console.error(`  [ERROR] Mismatch finding session data for group ${i + 1}. Expected ${group.length}, found ${groupData.length}.`);
            allTestsPassed = false;
            continue; // Skip to next group
        }

        console.log(`  Input for summarizeGroup (Topics): ${groupData.map(s => s.summaryTopic).join(' | ')}`);

        try {
            const summaryResult = await summarizeGroup(groupData, model);

            if (summaryResult === null) {
                console.error('  [FAIL] summarizeGroup returned null (indicating an error).');
                allTestsPassed = false;
            } else if (typeof summaryResult === 'object' && summaryResult.classifiedTopic) {
                console.log('  [SUCCESS] summarizeGroup returned:');
                console.log(`    Topic: ${summaryResult.classifiedTopic}`);
                console.log(`    Summary:`);
                summaryResult.classifiedSummary.forEach(pt => console.log(`      - ${pt}`));
                console.log(`    Keywords: ${summaryResult.classifiedKeywords.join(', ')}`);
            } else {
                console.error('  [FAIL] summarizeGroup returned an unexpected result:', summaryResult);
                allTestsPassed = false;
            }
        } catch (error) {
            console.error(`  [CRASH] Error during summarizeGroup test for group ${i + 1}:`, error);
            allTestsPassed = false;
        }
        console.log(`--- End Group ${i + 1} Test ---`);
    }

    console.log(`\n--- Overall Test Result: ${allTestsPassed ? 'All Groups Processed (Check Logs for Individual Success/Fail)' : 'One or More Groups Failed'} ---`);

})(); 