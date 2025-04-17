/**
 * Standard message format for chat interactions
 */
export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  function_result?: string | object;
  function_name?: string;
};

/**
 * Generic completion response items
 */
export type ResponseItem = {
  id: string;
  type: 'thinking' | 'message' | 'command' | 'error' | 'edit';
  text: string;
  timestamp: number;
  status?: 'pending' | 'success' | 'failure';
  file?: string;
  needsConfirmation?: boolean;
}; 