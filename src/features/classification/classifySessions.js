import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import dotenv from 'dotenv';
import classificationPrompt from '../../prompts/classification/v1/classification_prompt.js';

dotenv.config();

// Initialize Gemini model
const model = new ChatGoogleGenerativeAI({
    // TODO: Consider making model name configurable if needed
    modelName: 'gemini-1.5-pro',
    apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Classifies a list of sessions into semantic groups using an AI model.
 * @param {Array<Object>} sessions - List of session objects, each with id, summaryTopic, duration.
 * @returns {Promise<Array<Array<string>>|null>} A promise that resolves to a list of lists of session IDs, or null if an error occurs.
 */
async function classifySessions(sessions) {
    if (!sessions || sessions.length === 0) {
        console.log('[CLASSIFY] No sessions provided for classification.');
        return []; // Return empty array if no sessions
    }

    // Ensure API key is available
    if (!process.env.GEMINI_API_KEY) {
        console.error('[CLASSIFY] Gemini API key is missing.');
        return null;
    }

    try {
        // 1. Prepare input JSON string (only include necessary fields)
        const inputData = sessions.map(s => ({
            id: s.id,
            summaryTopic: s.summaryTopic || "", // Ensure summaryTopic is not null/undefined
            duration: s.duration || 0 // Ensure duration is not null/undefined
        }));
        const sessionListJson = JSON.stringify(inputData);

        // 2. Format the prompt
        const formattedPrompt = await classificationPrompt.format({
            session_list_json: sessionListJson,
        });

        // 3. Invoke the AI model
        console.log('[CLASSIFY] Calling Gemini for session classification...');
        const response = await model.invoke(formattedPrompt);
        const responseContent = response?.content;
        console.log('[CLASSIFY] Raw Gemini Response Content:', responseContent);

        // 4. Parse the response (robustly)
        if (typeof responseContent !== 'string' || responseContent.trim() === '') {
             console.error('[CLASSIFY] Invalid or empty response content from AI model.');
             return null;
        }

        let groupedIds = null;
        try {
            // Attempt to parse directly
            groupedIds = JSON.parse(responseContent.trim());
        } catch (directParseError) {
             console.warn('[CLASSIFY] Direct JSON parsing failed. Attempting extraction...');
             // Attempt to extract JSON array within potential markdown/text
             const jsonMatch = responseContent.match(/(\[\s*\[[\s\S]*?\]\s*\])/);
             if (jsonMatch && jsonMatch[1]) {
                 try {
                    groupedIds = JSON.parse(jsonMatch[1]);
                 } catch(extractParseError) {
                     console.error('[CLASSIFY] Failed to parse extracted JSON:', extractParseError);
                 }
             }
        }

        // 5. Validate the parsed structure
        if (Array.isArray(groupedIds) && groupedIds.every(Array.isArray)) {
            console.log('[CLASSIFY] Successfully parsed grouped session IDs:', groupedIds);
            return groupedIds;
        } else {
            console.error('[CLASSIFY] Parsed/Extracted response is not a valid list of lists:', groupedIds);
            return null; // Indicate failure to get valid structure
        }

    } catch (error) {
        console.error('[CLASSIFY] Error during session classification:', error);
        // Log specific API errors if possible
        if (error.response) {
            console.error('[CLASSIFY] API Error Response:', error.response.data);
        }
        return null; // Indicate error
    }
}

export { classifySessions }; 