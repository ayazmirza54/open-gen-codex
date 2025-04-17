// src/llm/geminiClient.ts
import {
    GoogleGenerativeAI,
    GenerateContentRequest,
    Content,
    Part,
    FunctionDeclaration,
    Tool,
    GenerationConfig,
} from '@google/generative-ai';
import { loadConfig, GOOGLE_API_KEY } from '../../utils/config';
import { ChatMessage } from '../../types';
import { randomUUID } from "node:crypto";

// Define simplified response types that align with OpenAI's format
interface GeminiCompatibleMessage {
    id: string;
    type: 'message' | 'function_call';
    role: 'assistant';
    content?: Array<{
        type: 'text';
        text: string;
    }>;
    function_call?: {
        name: string;
        arguments: string;
    };
}

// Function to get the API key securely
async function getGoogleApiKey(): Promise<string> {
    const config = loadConfig();

    // Check all possible sources
    const envApiKey = process.env["GOOGLE_API_KEY"];
    const configApiKey = config.googleApiKey;
    const globalApiKey = GOOGLE_API_KEY;

    // Log debug info
    console.log("Gemini API Key sources:");
    console.log("- Environment variable:", envApiKey ? "Present" : "Not found");
    console.log("- Config file:", configApiKey ? "Present" : "Not found");
    console.log("- Global variable:", globalApiKey ? "Present" : "Not found");

    // Try to load from all sources
    const apiKey = globalApiKey || envApiKey || configApiKey;

    if (!apiKey) {
        console.error("Google API Key not found in any location.");
        throw new Error('Google API Key not found. Set GOOGLE_API_KEY environment variable, create a .env file with GEMINI_API_KEY, or set googleApiKey in config.');
    }

    console.log("Using Gemini API Key:", apiKey.substring(0, 4) + "..." + apiKey.substring(apiKey.length - 4));
    return apiKey;
}

// Convert OpenAI-style function definitions to Gemini format
function convertToGeminiFunctions(functions: any[]): Tool[] {
    return functions.map(func => ({
        functionDeclarations: [{
            name: func.name,
            description: func.description,
            parameters: func.parameters
        }]
    }));
}

// Function to map your internal ChatMessage format to Gemini's Content format
function mapHistoryToGeminiContent(history: Readonly<Array<ChatMessage>>): Content[] {
    const geminiHistory: Content[] = [];
    let systemPrompt = '';

    // Extract system prompt if present
    for (const message of history) {
        if (message.role === 'system') {
            systemPrompt += message.content + '\n';
            continue;
        }

        const role = message.role === 'assistant' ? 'model' : message.role;
        if (role === 'user' || role === 'model') {
            // Handle function calls in assistant messages
            if (message.role === 'assistant' && message.function_call) {
                const parts: Part[] = [
                    { text: message.content || '' },
                    {
                        functionCall: {
                            name: message.function_call.name,
                            args: JSON.parse(message.function_call.arguments || '{}')
                        }
                    }
                ];
                geminiHistory.push({ role: 'model', parts });
            }
            // Handle function results in user messages
            else if (message.role === 'user' && message.function_result) {
                const parts: Part[] = [
                    { text: message.content || '' },
                    {
                        functionResponse: {
                            name: message.function_name || '',
                            response: typeof message.function_result === 'string'
                                ? JSON.parse(message.function_result as string)
                                : message.function_result
                        }
                    }
                ];
                geminiHistory.push({ role: 'user', parts });
            }
            // Standard text messages
            else {
                geminiHistory.push({
                    role: role,
                    parts: [{ text: message.content }]
                });
            }
        }
    }

    // Add system prompt as a preamble to the first user message if there is any
    if (systemPrompt && geminiHistory.length > 0 && geminiHistory[0]?.role === 'user') {
        const firstUserMessage = geminiHistory[0];
        if (firstUserMessage && firstUserMessage.parts && firstUserMessage.parts[0]) {
            const updatedText = `${systemPrompt}\n${(firstUserMessage.parts[0] as { text: string }).text}`;
            geminiHistory[0] = {
                ...firstUserMessage,
                parts: [{ text: updatedText }]
            };
        }
    }

    return geminiHistory;
}

// Convert Gemini response to OpenAI-compatible format
function convertGeminiResponseToOpenAI(content: string, functionCall?: any): GeminiCompatibleMessage {
    const id = `resp_${randomUUID().replaceAll('-', '')}`;

    // Handle function calls
    if (functionCall) {
        return {
            id,
            type: 'function_call',
            role: 'assistant',
            function_call: {
                name: functionCall.name,
                arguments: JSON.stringify(functionCall.args)
            }
        };
    }

    // Standard text response
    return {
        id,
        type: 'message',
        role: 'assistant',
        content: [
            {
                type: 'text',
                text: content
            }
        ]
    };
}

// Parse Gemini responses for potential function calls
// Note: This is a simplified implementation
function extractFunctionCall(text: string): any | undefined {
    // Try to detect function call patterns in the text
    // This is a simplified approach - production would need more robust parsing
    const functionCallRegex = /```(?:json)?\s*\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}\s*```/;
    const match = text.match(functionCallRegex);

    if (match && match[1] && match[2]) {
        try {
            const name = match[1];
            const args = JSON.parse(match[2]);
            return { name, args };
        } catch (e) {
            console.warn("Failed to parse function call from text:", e);
            return undefined;
        }
    }

    return undefined;
}

// Main function to stream completions
export async function* streamGeminiCompletion(
    prompt: string,
    modelName: string,
    history: Readonly<Array<ChatMessage>>,
    functions?: any[],
    temperature?: number,
    maxTokens?: number
): AsyncGenerator<GeminiCompatibleMessage, void, undefined> {
    const apiKey = await getGoogleApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const geminiHistory = mapHistoryToGeminiContent(history);
    const currentTurn: Content = { role: 'user', parts: [{ text: prompt }] };

    // Configure generation parameters
    const generationConfig: GenerationConfig = {
        temperature: temperature ?? 0.7,
        maxOutputTokens: maxTokens ?? 2048
    };

    const request: GenerateContentRequest = {
        contents: [...geminiHistory, currentTurn],
        generationConfig
    };

    // Add tools/functions if provided
    if (functions && functions.length > 0) {
        request.tools = convertToGeminiFunctions(functions);
    }

    try {
        const result = await model.generateContentStream(request);
        let accumulatedText = '';
        let hasFunctionCall = false;

        // For non-streaming use case
        if (!result.stream) {
            const response = await result.response;
            const text = response.text() || '';

            // Check for function calls in the response
            const functionCall = extractFunctionCall(text);
            yield convertGeminiResponseToOpenAI(text, functionCall);
            return;
        }

        // Handle streaming response
        for await (const chunk of result.stream) {
            const chunkText = chunk.text?.() ?? '';
            accumulatedText += chunkText;

            // We need to analyze the accumulated text for potential function calls
            // This is a simplified approach - in production, would need more robust parsing
            const functionCall = extractFunctionCall(accumulatedText);

            if (functionCall && !hasFunctionCall) {
                hasFunctionCall = true;
                yield convertGeminiResponseToOpenAI('', functionCall);
            } else if (chunkText && !hasFunctionCall) {
                yield convertGeminiResponseToOpenAI(chunkText);
            }
        }

        // If we finished without detecting a function call but the text suggests one
        if (!hasFunctionCall) {
            const finalFunctionCall = extractFunctionCall(accumulatedText);
            if (finalFunctionCall) {
                yield convertGeminiResponseToOpenAI('', finalFunctionCall);
            }
        }
    } catch (error: unknown) {
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error) {
            throw new Error(`Gemini API Error: ${error.message}`);
        }
        throw new Error(`An unknown error occurred with the Gemini API.`);
    }
}

// Define a type for tool calls
interface GeminiToolCall {
    id: string;
    type: 'function_call';
    function: {
        name: string;
        arguments: string;
    };
}

// Parse text for potential tool calls made by Gemini
export function parseToolCallsFromGemini(text: string): GeminiToolCall[] {
    const toolCalls: GeminiToolCall[] = [];

    // This regex looks for tool calls in the format that Gemini might generate
    const toolCallRegex = /```(?:json)?\s*\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}\s*```/g;

    let match;
    while ((match = toolCallRegex.exec(text)) !== null) {
        if (match[1] && match[2]) {
            try {
                const name = match[1];
                const args = match[2];

                toolCalls.push({
                    id: `call_${randomUUID().replaceAll('-', '')}`,
                    type: 'function_call',
                    function: {
                        name,
                        arguments: args
                    }
                });
            } catch (e) {
                console.warn("Failed to parse tool call:", e);
            }
        }
    }

    return toolCalls;
}

// Convert from OpenAI format to Gemini format for function results
export function convertFunctionResultToGemini(
    functionName: string,
    functionResult: string
): Part {
    try {
        const parsedResult = JSON.parse(functionResult);
        return {
            functionResponse: {
                name: functionName,
                response: parsedResult
            }
        };
    } catch (e) {
        // If parsing fails, use the string directly
        return {
            functionResponse: {
                name: functionName,
                response: { result: functionResult }
            }
        };
    }
}