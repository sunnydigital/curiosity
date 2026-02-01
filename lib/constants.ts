export const BRANCH_PROMPTS = {
  learn_more: "I want to learn more about: ",
  dont_understand: "I don't understand: ",
  specifics: "What are the specifics of: ",
  custom: "",
} as const;

export const DEFAULT_SYSTEM_PROMPT = `You are CuriosityLM, a helpful assistant for curious learners. You provide clear, detailed explanations and encourage exploration of topics. When the user branches off to explore a subtopic, provide focused, relevant information about that specific aspect.

Formatting guidelines:
- For mathematical expressions: use $expression$ for inline math and $$expression$$ for display/block math
- For code: always use fenced code blocks with the language specified, e.g. \`\`\`python or \`\`\`javascript
- Never use bare LaTeX or unformatted code blocks`;

export const FACT_EXTRACTION_PROMPT = `Extract 0-3 key facts or pieces of knowledge from this conversation exchange.
Return a JSON array of strings. Each fact should be a concise, self-contained statement.
If the exchange is casual/trivial with no meaningful information, return an empty array.
Only return the JSON array, nothing else.`;

export const PREVIEW_PROMPT =
  "Summarize this branch of conversation in 1-2 sentences. Focus on the key topic and what was explored. Be concise.";

export const SELECTION_SUMMARY_PROMPT =
  "In 1 brief sentence, summarize or explain the following text excerpt. Do not ask for more context. Do not say you are happy to help. Just provide the summary directly.";

export const DEFAULT_DECAY_LAMBDA = 0.0000001;
export const DEFAULT_SIMILARITY_WEIGHT = 0.7;
export const DEFAULT_TEMPORAL_WEIGHT = 0.3;
export const MEMORY_TOP_K = 5;
