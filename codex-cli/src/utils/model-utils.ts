import { OPENAI_API_KEY } from "./config";
import OpenAI from "openai";
import { GoogleGenAI } from '@google/genai';
import { loadConfig, GOOGLE_API_KEY } from "./config";
import { ChatMessage } from "../types";

const MODEL_LIST_TIMEOUT_MS = 2_000; // 2 seconds
export const RECOMMENDED_MODELS: Array<string> = ["o4-mini", "o3"];
export const GEMINI_MODELS: Array<string> = [
  "gemini-1.5-pro", 
  "gemini-1.5-flash", 
  "gemini-1.5-pro-latest",
  "gemini-2.5-pro-preview-03-25", 
  "gemini-pro",
  "gemini-2.0-flash"
];

/**
 * Background model loader / cache.
 *
 * We start fetching the list of available models from OpenAI once the CLI
 * enters interactive mode.  The request is made exactly once during the
 * lifetime of the process and the results are cached for subsequent calls.
 */

let modelsPromise: Promise<Array<string>> | null = null;

async function fetchModels(): Promise<Array<string>> {
  // If the user has not configured an API key we cannot hit the network.
  if (!OPENAI_API_KEY) {
    return [...RECOMMENDED_MODELS, ...GEMINI_MODELS];
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const list = await openai.models.list();

    const models: Array<string> = [];
    for await (const model of list as AsyncIterable<{ id?: string }>) {
      if (model && typeof model.id === "string") {
        models.push(model.id);
      }
    }

    // Add Gemini models to the list
    return [...models, ...GEMINI_MODELS].sort();
  } catch {
    return [...RECOMMENDED_MODELS, ...GEMINI_MODELS];
  }
}

export function preloadModels(): void {
  if (!modelsPromise) {
    // Fire‑and‑forget – callers that truly need the list should `await`
    // `getAvailableModels()` instead.
    void getAvailableModels();
  }
}

export async function getAvailableModels(): Promise<Array<string>> {
  if (!modelsPromise) {
    modelsPromise = fetchModels();
  }
  return modelsPromise;
}

/**
 * Verify that the provided model identifier is present in the set returned by
 * {@link getAvailableModels}. The list of models is fetched from the OpenAI
 * `/models` endpoint the first time it is required and then cached in‑process.
 */
export async function isModelSupportedForResponses(
  model: string | undefined | null,
): Promise<boolean> {
  if (
    typeof model !== "string" ||
    model.trim() === "" ||
    RECOMMENDED_MODELS.includes(model) ||
    GEMINI_MODELS.includes(model)
  ) {
    return true;
  }

  try {
    const models = await Promise.race<Array<string>>([
      getAvailableModels(),
      new Promise<Array<string>>((resolve) =>
        setTimeout(() => resolve([]), MODEL_LIST_TIMEOUT_MS),
      ),
    ]);

    // If the timeout fired we get an empty list → treat as supported to avoid
    // false negatives.
    if (models.length === 0) {
      return true;
    }

    return models.includes(model.trim());
  } catch {
    // Network or library failure → don't block start‑up.
    return true;
  }
}

/**
 * Determines if the provided model is a Gemini model
 */
export function isGeminiModel(model: string): boolean {
  return GEMINI_MODELS.includes(model);
}

/**
 * Simplified Gemini API implementation using the newer GoogleGenAI SDK
 */
export async function* streamSimpleGeminiCompletion(
  prompt: string,
  modelName: string,
  history: Readonly<Array<ChatMessage>>
): AsyncGenerator<string, void, undefined> {
  const config = loadConfig();
  const apiKey = GOOGLE_API_KEY || process.env["GOOGLE_API_KEY"] || process.env["GEMINI_API_KEY"] || config.googleApiKey;
  
  if (!apiKey) {
    throw new Error('Google API Key not found. Set GOOGLE_API_KEY environment variable, create a .env file with GEMINI_API_KEY, or set googleApiKey in config.');
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const geminiConfig = { responseMimeType: 'text/plain' };
  
  // Convert our history format to Gemini's format
  const contents = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [{ text: msg.content }]
  }));
  
  // Add current prompt as a user message
  contents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });
  
  try {
    const response = await ai.models.generateContentStream({
      model: modelName,
      config: geminiConfig,
      contents,
    });
    
    for await (const chunk of response) {
      yield chunk.text;
    }
  } catch (error) {
    console.error("Error streaming from Gemini API:", error);
    throw error;
  }
}

/**
 * Legacy Gemini API streaming implementation
 */
export async function* streamGeminiCompletion(
  prompt: string,
  modelName: string,
  history: Readonly<Array<ChatMessage>>,
  functions?: any[],
  temperature?: number,
  maxTokens?: number
): AsyncGenerator<any, void, undefined> {
  const config = loadConfig();
  const apiKey = GOOGLE_API_KEY || process.env["GOOGLE_API_KEY"] || process.env["GEMINI_API_KEY"] || config.googleApiKey;
  
  if (!apiKey) {
    throw new Error('Google API Key not found. Set GOOGLE_API_KEY environment variable, create a .env file with GEMINI_API_KEY, or set googleApiKey in config.');
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Convert our history format to Gemini's format
  const contents = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [{ text: msg.content }]
  }));
  
  // Add current prompt as a user message
  contents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });
  
  const geminiConfig: any = { 
    temperature: temperature || 0.7,
    responseMimeType: 'text/plain'
  };
  
  if (maxTokens) {
    geminiConfig.maxOutputTokens = maxTokens;
  }
  
  if (functions && functions.length > 0) {
    geminiConfig.tools = functions;
  }
  
  try {
    const response = await ai.models.generateContentStream({
      model: modelName,
      contents,
      generationConfig: geminiConfig
    });
    
    for await (const chunk of response) {
      // Format response to match the expected format in streamModelCompletion
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
        yield {
          content: [{
            text: chunk.candidates[0].content.parts[0].text
          }]
        };
      } else if (chunk.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
        const functionCall = chunk.candidates[0].content.parts[0].functionCall;
        yield {
          type: 'function_call',
          function_call: {
            name: functionCall.name,
            arguments: JSON.stringify(functionCall.args)
          }
        };
      }
    }
  } catch (error) {
    console.error("Error streaming from Gemini API:", error);
    throw error;
  }
}

export async function* streamModelCompletion(
  prompt: string,
  modelName: string,
  history: Readonly<Array<ChatMessage>>,
  functions?: any[],
  temperature?: number,
  maxTokens?: number
): AsyncGenerator<string, void, undefined> {
  // Route to Gemini if it's a Gemini model
  if (isGeminiModel(modelName)) {
    try {
      // Use the simple Gemini implementation
      for await (const text of streamSimpleGeminiCompletion(prompt, modelName, history)) {
        yield text;
      }
      return;
    } catch (error) {
      console.error("Error with simple Gemini implementation:", error);
      console.log("Falling back to standard Gemini implementation...");
      
      // Fall back to the existing implementation if the simple one fails
      for await (const response of streamGeminiCompletion(
        prompt, 
        modelName, 
        history, 
        functions,
        temperature,
        maxTokens
      )) {
        if (response.type === 'function_call' && response.function_call) {
          yield `[Function Call: ${response.function_call.name}]\n${response.function_call.arguments}`;
        } else if (response.content && response.content.length > 0) {
          yield response.content[0].text;
        }
      }
      return;
    }
  }
  
  // OpenAI implementation
  const config = loadConfig();
  const apiKey = OPENAI_API_KEY || process.env["OPENAI_API_KEY"] || config.apiKey;
  
  if (!apiKey) {
    throw new Error('OpenAI API Key not found. Set OPENAI_API_KEY environment variable or apiKey in config.');
  }
  
  const openai = new OpenAI({ apiKey });
  
  // Convert messages to OpenAI format
  const messages = history.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  // Add current prompt as user message
  messages.push({
    role: 'user',
    content: prompt
  });
  
  try {
    const completionOptions: any = {
      model: modelName,
      messages,
      stream: true
    };
    
    if (temperature !== undefined) {
      completionOptions.temperature = temperature;
    }
    
    if (maxTokens !== undefined) {
      completionOptions.max_tokens = maxTokens;
    }
    
    if (functions && functions.length > 0) {
      completionOptions.functions = functions;
    }
    
    const stream = await openai.chat.completions.create(completionOptions);
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
      
      // Handle function calls
      const functionCall = chunk.choices[0]?.delta?.function_call;
      if (functionCall) {
        if (functionCall.name) {
          yield `[Function Call: ${functionCall.name}]`;
        }
        if (functionCall.arguments) {
          yield `\n${functionCall.arguments}`;
        }
      }
    }
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    throw error;
  }
}

/**
 * Simple non-streaming Gemini completion
 */
export async function simpleGeminiCompletion(
  prompt: string,
  modelName: string,
  history: Readonly<Array<ChatMessage>> = []
): Promise<string> {
  const config = loadConfig();
  const apiKey = GOOGLE_API_KEY || process.env["GOOGLE_API_KEY"] || process.env["GEMINI_API_KEY"] || config.googleApiKey;
  
  if (!apiKey) {
    throw new Error('Google API Key not found. Set GOOGLE_API_KEY environment variable, create a .env file with GEMINI_API_KEY, or set googleApiKey in config.');
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Convert our history format to Gemini's format
  const contents = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [{ text: msg.content }]
  }));
  
  // Add current prompt as a user message if history exists, otherwise use prompt directly
  let requestContents;
  if (history.length > 0) {
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });
    requestContents = contents;
  } else {
    requestContents = prompt; // Simple string for single-turn completion
  }
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: requestContents,
    });
    
    return response.response.text();
  } catch (error) {
    console.error("Error with Gemini API:", error);
    throw error;
  }
}
