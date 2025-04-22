import { ChatGoogleGenerativeAI } from '@langchain/google-genai'; // Type hint
import dotenv from 'dotenv';
import summarizationPrompt from '../../prompts/classification/v1/summarization_prompt.js';

dotenv.config();

/**
 * Generates a summary, topic, and keywords for a group of sessions using an AI model.
 * @param {Array<Object>} groupSessions - List of session objects for a single group (must contain summaryTopic, summaryPoints, duration).
 * @param {ChatGoogleGenerativeAI} model - Initialized Gemini model instance.
 * @returns {Promise<{classifiedTopic: string, classifiedSummary: string[], classifiedKeywords: string[]}|null>} A promise that resolves to an object with summary details or null on error.
 */
async function summarizeGroup(groupSessions, model) {
    if (!model) {
        console.error('[SUMMARIZE] Model instance is required.');
        return null;
    }
    if (!groupSessions || groupSessions.length === 0) {
        console.log('[SUMMARIZE] No sessions provided for summarization.');
        return null; // Or return a default empty object?
    }
    // Ensure API key is available (checked again for safety)
    if (!process.env.GEMINI_API_KEY) {
        console.error('[SUMMARIZE] Gemini API key is missing.');
        return null;
    }

    try {
        // 1. Prepare input JSON string (include necessary fields for summarization)
        const inputData = groupSessions.map(s => ({
            summaryTopic: s.summaryTopic || "",
            summaryPoints: s.summaryPoints || [],
            duration: s.duration || 0
        }));
        const sessionGroupJson = JSON.stringify(inputData);

        // 2. Format the prompt
        const formattedPrompt = await summarizationPrompt.format({
            session_group_json: sessionGroupJson,
        });

        // 3. Invoke the AI model
        console.log(`[SUMMARIZE] Calling Gemini for group summarization (Group size: ${groupSessions.length})...`);
        const response = await model.invoke(formattedPrompt);
        const responseContent = response?.content;
        console.log('[SUMMARIZE] Raw Gemini Response Content:', responseContent);

        // 4. Parse the response (robustly)
        if (typeof responseContent !== 'string' || responseContent.trim() === '') {
            console.error('[SUMMARIZE] Invalid or empty response content from AI model.');
            return null;
        }

        let summaryResult = null;
        try {
            // Attempt to parse directly as JSON object
            summaryResult = JSON.parse(responseContent.trim());
        } catch (directParseError) {
            console.warn('[SUMMARIZE] Direct JSON parsing failed. Attempting extraction from potential markdown...');
            // Attempt to extract JSON object within potential markdown ```json ... ```
            const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    summaryResult = JSON.parse(jsonMatch[1]);
                } catch (extractParseError) {
                    console.error('[SUMMARIZE] Failed to parse extracted JSON:', extractParseError);
                }
            }
            if (!summaryResult) {
                 // Attempt to find JSON object without markdown markers if previous attempts failed
                 const looseJsonMatch = responseContent.match(/{\s*"classifiedTopic":[\s\S]*?}/);
                 if(looseJsonMatch && looseJsonMatch[0]){
                     try{
                         summaryResult = JSON.parse(looseJsonMatch[0]);
                     } catch (looseParseError) {
                         console.error('[SUMMARIZE] Failed to parse loosely matched JSON object:', looseParseError);
                     }
                 }
             }
        }

        // 5. Validate the parsed structure
        if (
            summaryResult &&
            typeof summaryResult === 'object' &&
            typeof summaryResult.classifiedTopic === 'string' &&
            Array.isArray(summaryResult.classifiedSummary) &&
            Array.isArray(summaryResult.classifiedKeywords)
        ) {
            console.log(`[SUMMARIZE] Successfully parsed summary for group.`);
            // Further validation (optional): Check character limits, array lengths
            if (summaryResult.classifiedTopic.length > 40) {
                 console.warn(`[SUMMARIZE] classifiedTopic exceeds 40 characters: ${summaryResult.classifiedTopic}`);
                 // Optionally truncate: summaryResult.classifiedTopic = summaryResult.classifiedTopic.slice(0, 40);
            }
            if (summaryResult.classifiedSummary.length < 3 || summaryResult.classifiedSummary.length > 5) {
                 console.warn(`[SUMMARIZE] classifiedSummary count is outside the 3-5 range: ${summaryResult.classifiedSummary.length}`);
            }
             if (summaryResult.classifiedKeywords.length > 10) {
                 console.warn(`[SUMMARIZE] classifiedKeywords has more than 10 keywords: ${summaryResult.classifiedKeywords.length}`);
                  // Optionally truncate: summaryResult.classifiedKeywords = summaryResult.classifiedKeywords.slice(0, 10);
            }
            return summaryResult; // Return the parsed object
        } else {
            console.error('[SUMMARIZE] Parsed/Extracted response is not a valid summary object structure:', summaryResult);
            return null; // Indicate failure
        }

    } catch (error) {
        console.error(`[SUMMARIZE] Error during group summarization:`, error);
        if (error.response) {
            console.error('[SUMMARIZE] API Error Response:', error.response.data);
        }
        return null;
    }
}

export { summarizeGroup }; 