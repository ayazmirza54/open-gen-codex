import { ChatMessage } from '../../types';
import { streamGeminiCompletion } from './gemini_wrapper';
import { isGeminiModel } from '../../utils/model-utils';
import OpenAI from 'openai';
import { loadConfig } from '../../utils/config';

/**
 * Stream completions from the appropriate LLM based on model name
 */
export async function* streamModelCompletion(
  prompt: string,
  modelName: string,
  history: Readonly<Array<ChatMessage>>,
): AsyncGenerator<string, void, undefined> {
  // Route to Gemini if it's a Gemini model
  if (isGeminiModel(modelName)) {
    yield* streamGeminiCompletion(prompt, modelName, history);
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
    const stream = await openai.chat.completions.create({
      model: modelName,
      messages,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
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