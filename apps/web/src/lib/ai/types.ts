/** Shared contract for the bring-your-own-key AI adapter (spec Part 8). */
export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a JSON object response when supported. */
  json?: boolean;
}

export interface AiClient {
  /** Provider label shown in the UI, e.g. "OpenAI-compatible (groq)". */
  readonly label: string;
  complete(request: AiCompletionRequest): Promise<string>;
}
