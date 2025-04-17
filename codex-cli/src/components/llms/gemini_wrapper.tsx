// src/llm/geminiClient.ts
import {
    GoogleGenerativeAI,
    GenerateContentRequest,
    Content,
    Part,
    GenerateContentResponse, // Use this for streaming type info
    // ... other necessary types
} from '@google/generative-ai';
import { loadConfig, GOOGLE_API_KEY } from '../../utils/config';
import { ChatMessage } from '../../types';

// Function to get the API key securely
async function getGoogleApiKey(): Promise<string> {
    const config = loadConfig();
    const apiKey = GOOGLE_API_KEY ?? config.googleApiKey;
    if (!apiKey) {
        throw new Error('Google API Key not found. Set GOOGLE_API_KEY environment variable or googleApiKey in config.');
    }
    return apiKey;
}

// Function to map your internal ChatMessage format to Gemini's Content format
function mapHistoryToGeminiContent(history: Readonly<Array<ChatMessage>>): Content[] {
    const geminiHistory: Content[] = [];
    // Gemini expects alternating user/model roles.
    // Ensure your ChatMessage type has a 'role' ('user' or 'assistant'/'model')
    // and 'content'.
    for (const message of history) {
        const role = message.role === 'assistant' ? 'model' : message.role; // Map 'assistant' to 'model'
        if (role === 'user' || role === 'model') {
            // Gemini expects content as an array of Parts, usually just one text part.
            geminiHistory.push({ role: role, parts: [{ text: message.content }] });
        }
        // Handle system prompts differently if needed - Gemini often uses the first message
        // or specific instructions rather than a dedicated 'system' role in history.
    }
    // Ensure history starts with 'user' if required by the specific Gemini model/task
    // Add error handling or filtering for unsupported roles.
    return geminiHistory;
}


// Main function to stream completions
export async function* streamGeminiCompletion(
    prompt: string,
    modelName: string,
    history: Readonly<Array<ChatMessage>>,
    // Add other parameters like temperature, maxTokens if needed
): AsyncGenerator<string, void, undefined> {
    const apiKey = await getGoogleApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const geminiHistory = mapHistoryToGeminiContent(history);

    // Prepare the request - Gemini uses the last message as the current prompt
    // if structured within the history. Or handle the prompt separately.
    const currentTurn: Content = { role: 'user', parts: [{ text: prompt }] };

    const request: GenerateContentRequest = {
        // Combine history and the current prompt
        contents: [...geminiHistory, currentTurn],
        // Add generationConfig for temperature, maxOutputTokens, etc.
        // generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    };

    try {
        const result = await model.generateContentStream(request);

        // Iterate through the stream
        for await (const chunk of result.stream) {
            // Check if chunk has text and yield it
            const chunkText = chunk.text?.(); // Use optional chaining
            if (chunkText) {
                yield chunkText;
            }
            // You might need more robust handling depending on how Gemini structures chunks
        }
    } catch (error: unknown) {
        // Add more specific error handling for Gemini API errors
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error) {
            throw new Error(`Gemini API Error: ${error.message}`);
        }
        throw new Error(`An unknown error occurred with the Gemini API.`);
    }
}

// Optional: Add a non-streaming function if needed later
// export async function getGeminiCompletion(...) { ... }