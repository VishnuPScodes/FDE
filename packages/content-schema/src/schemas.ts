import { z } from 'zod';

// ─── Environment types ────────────────────────────────────────────────────────

export const LevelEnvironmentSchema = z.enum([
  'python',
  'sql',
  'shell',
  'git',
  'js',
  'ts',
  'docker',
  'kubernetes',
  'aws',
  'terraform',
  'ci',
  'http',
  'observability',
  'ai',
  'writing',
  'roleplay',
  'quiz',
  'realworld',
]);

export type LevelEnvironment = z.infer<typeof LevelEnvironmentSchema>;

// ─── Level type ───────────────────────────────────────────────────────────────

export const LevelTypeSchema = z.enum([
  'code',
  'sql',
  'terminal',
  'console',
  'project',
  'quiz',
  'writing',
  'roleplay',
  'decomposition',
  'realworld',
]);

export type LevelType = z.infer<typeof LevelTypeSchema>;

// ─── Level status ─────────────────────────────────────────────────────────────

export const LevelStatusSchema = z.enum([
  'locked',
  'unlocked',
  'in_progress',
  'passed',
]);

export type LevelStatus = z.infer<typeof LevelStatusSchema>;

// ─── Check kinds ──────────────────────────────────────────────────────────────

export const CheckKindSchema = z.enum([
  'stdout_equals',
  'stdout_matches',
  'stderr_contains',
  'exit_code',
  'file_exists',
  'file_contains',
  'json_equals',
  'pytest_passes',
  'vitest_passes',
  'preview_contains',
  'sql_result_equals',
  'sql_plan_uses_index',
  'git_state',
  'sim_state',
  'sim_command_used',
  'http_response',
  'live_url',
  'github_repo',
  'checker_token',
  'ai_rubric',
  'checklist',
  'time_limit',
]);

export type CheckKind = z.infer<typeof CheckKindSchema>;

// ─── Individual check ─────────────────────────────────────────────────────────

const BaseCheckSchema = z.object({
  kind: CheckKindSchema,
  /** Shell command to run before checking (optional) */
  run: z.string().optional(),
  /** Human-readable label for this check */
  label: z.string().optional(),
});

export const CheckSchema = BaseCheckSchema.and(
  z.record(z.string(), z.unknown()),
);

export type Check = z.infer<typeof CheckSchema>;

// ─── Feedback rule ────────────────────────────────────────────────────────────

export const FeedbackRuleSchema = z.object({
  when: z.record(z.string(), z.unknown()),
  message: z.string(),
});

export type FeedbackRule = z.infer<typeof FeedbackRuleSchema>;

// ─── Starter file ─────────────────────────────────────────────────────────────

export const StarterFileSchema = z.object({
  path: z.string(),
  from: z.string().optional(),
  content: z.string().optional(),
});

export type StarterFile = z.infer<typeof StarterFileSchema>;

// ─── Level (level.yaml) ───────────────────────────────────────────────────────

export const LevelSchema = z.object({
  /** Unique identifier: phase-week-topic-number, never reused */
  id: z.string().regex(/^p\d-w\d{2}-[a-z0-9-]+-\d{3}$/, {
    message: 'Level ID must match pattern p{phase}-w{week}-{topic}-{number}, e.g. p0-w01-py-001',
  }),
  title: z.string().min(3).max(80),
  phase: z.number().int().min(0).max(6),
  week: z.number().int().min(1).max(24),
  module: z.string(),
  order: z.number().int().min(1),
  difficulty: z.number().int().min(1).max(5),
  estimated_minutes: z.number().int().min(1).max(180),
  type: LevelTypeSchema,
  environment: LevelEnvironmentSchema,
  lesson: z.string().optional(),
  task: z.string().min(10),
  starter_files: z.array(StarterFileSchema).optional(),
  checks: z.array(CheckSchema).min(1),
  hints: z.array(z.string()).min(2, { message: 'Every level needs at least 2 hints' }),
  feedback: z.array(FeedbackRuleSchema).optional(),
  solution: z.string().optional(),
  unlocks: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  mobile_compatible: z.boolean().optional(),
  real_world_guide: z.string().optional(),
  timed: z.boolean().optional(),
});

export type Level = z.infer<typeof LevelSchema>;

// ─── Module (a collection of levels) ─────────────────────────────────────────

export const ModuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  week: z.number().int(),
  phase: z.number().int(),
  levels: z.array(z.string()),  // level IDs in order
  checkpoint_level: z.string().optional(),
});

export type Module = z.infer<typeof ModuleSchema>;

// ─── curriculum.yaml ─────────────────────────────────────────────────────────

export const CurriculumSchema = z.object({
  version: z.string(),
  phases: z.array(
    z.object({
      id: z.number().int(),
      title: z.string(),
      weeks: z.array(
        z.object({
          week: z.number().int(),
          title: z.string(),
          modules: z.array(z.string()),  // module IDs
        }),
      ),
      project: z.string().optional(),
    }),
  ),
});

export type Curriculum = z.infer<typeof CurriculumSchema>;
