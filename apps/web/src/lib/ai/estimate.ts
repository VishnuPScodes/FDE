import type { AiCompletionRequest } from './types';
import type { AiPricing } from './providers';

/** Rough rule of thumb for English text: about four characters per token. */
export const CHARS_PER_TOKEN = 4;
/** Small per-message overhead that chat formats add (role markers etc.). */
export const MESSAGE_OVERHEAD_TOKENS = 4;
/** Approximate rupees per US dollar used for display only. */
export const DEFAULT_INR_PER_USD = 88;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimated input tokens for a whole request (system + every message). */
export function estimateRequestTokens(request: AiCompletionRequest): number {
  let total = request.system ? estimateTokens(request.system) + MESSAGE_OVERHEAD_TOKENS : 0;
  for (const message of request.messages) total += estimateTokens(message.content) + MESSAGE_OVERHEAD_TOKENS;
  return total;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  inr: number;
}

export function estimateCost(inputTokens: number, outputTokens: number, pricing: AiPricing | undefined, inrPerUsd = DEFAULT_INR_PER_USD): CostEstimate {
  const usd = pricing ? (inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok) / 1_000_000 : 0;
  return { inputTokens, outputTokens, usd, inr: usd * inrPerUsd };
}

export function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(2)}`;
}

export function formatInr(value: number): string {
  if (value === 0) return '₹0';
  if (value < 1) return `₹${value.toFixed(4)}`;
  return `₹${value.toFixed(2)}`;
}
