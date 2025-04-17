import { ChatMessage } from '../../types';
import { streamGeminiCompletion } from './gemini_wrapper';
import { isGeminiModel } from '../../utils/model-utils';
import OpenAI from 'openai';
import { loadConfig } from '../../utils/config';
import type { ResponseItem } from "openai/resources/responses/responses.mjs";

/**
 * Stream completions from the appropriate LLM based on model name
 */
export async function* streamModelCompletion(
  prompt: string,
  modelName: string,
  history: Readonly<Array<ChatMessage>>,
  functions?: any[], // Add optional functions parameter
  temperature?: number,
  maxTokens?: number
): AsyncGenerator<string, void, undefined> {
  // Route to Gemini if it's a Gemini model
  if (isGeminiModel(modelName)) {
    // Convert Gemini responses to text for the standard interface
    for await (const response of streamGeminiCompletion(
      prompt, 
      modelName, 
      history, 
      functions,
      temperature,
      maxTokens
    )) {
      if (response.type === 'function_call' && response.function_call) {
        // For function calls, format them as text in a way the UI can present
        yield `[Function Call: ${response.function_call.name}]\n${response.function_call.arguments}`;
      } else if (response.content && response.content.length > 0) {
        // For regular text responses
        yield response.content[0].text;
      }
    }
    return;
  }
  
  // Default to OpenAI
  const config = loadConfig();
  const apiKey = process.env['OPENAI_API_KEY'] ?? config.apiKey;
  
  if (!apiKey) {
    throw new Error('OpenAI API Key not found. Set OPENAI_API_KEY environment variable or apiKey in config.');
  }
  
  const openai = new OpenAI({ apiKey });
  
  // Convert our messages to OpenAI format
  const messages = history.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  // Add the current prompt as a user message
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
    
    // Add functions if provided
    if (functions && functions.length > 0) {
      completionOptions.functions = functions;
    }
    
    // Add temperature if provided
    if (temperature !== undefined) {
      completionOptions.temperature = temperature;
    }
    
    // Add max tokens if provided
    if (maxTokens !== undefined) {
      completionOptions.max_tokens = maxTokens;
    }
    
    const stream = await openai.chat.completions.create(completionOptions);
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
      
      // Handle function calls from OpenAI
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
  } catch (error: unknown) {
    console.error("Error calling OpenAI API:", error);
    if (error instanceof Error) {
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
    throw new Error(`An unknown error occurred with the OpenAI API.`);
  }
} 