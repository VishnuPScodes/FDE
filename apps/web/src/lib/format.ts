const WORDS: Record<string, string> = {
  sql: 'SQL', api: 'API', apis: 'APIs', fastapi: 'FastAPI', oauth: 'OAuth', oidc: 'OIDC', jwt: 'JWT', rbac: 'RBAC',
  etl: 'ETL', aws: 'AWS', cicd: 'CI/CD', ui: 'UI', llm: 'LLM', mcp: 'MCP', rag: 'RAG', roi: 'ROI', llmops: 'LLMOps',
  typescript: 'TypeScript', gudcmarr: 'GUDCMARR', decomp: 'Decomposition', rest: 'REST', github: 'GitHub', and: 'and',
};

/** Human label for a module slug, e.g. "sql-foundations" → "SQL Foundations". */
export function formatModuleName(slug: string): string {
  return slug
    .split('-')
    .map((word, index) => WORDS[word] && !(index === 0 && word === 'and') ? WORDS[word] : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
