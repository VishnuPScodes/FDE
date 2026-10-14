import type { ZodError } from 'zod';
import { LevelSchema, CurriculumSchema } from './schemas';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

/**
 * Validates a parsed level.yaml object.
 * Returns typed data on success, or a list of human-readable error messages.
 */
export function validateLevel(raw: unknown): ValidationResult<import('./schemas').Level> {
  const result = LevelSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}

/**
 * Validates a parsed curriculum.yaml object.
 */
export function validateCurriculum(
  raw: unknown,
): ValidationResult<import('./schemas').Curriculum> {
  const result = CurriculumSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}

function formatZodErrors(error: ZodError): string[] {
  return error.errors.map((e) => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });
}
