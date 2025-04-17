/**
 * Standard message format for chat interactions
 */
export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
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