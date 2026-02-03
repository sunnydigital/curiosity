export const BRANCH_PROMPTS = {
  learn_more: "I want to learn more about: ",
  dont_understand: "I don't understand: ",
  specifics: "What are the specifics of: ",
  custom: "",
} as const;

export const DEFAULT_SYSTEM_PROMPT = `You are Curiosity, a helpful assistant for curious learners. You provide clear, detailed explanations and encourage exploration of topics. When the user branches off to explore a subtopic, provide focused, relevant information about that specific aspect.

Formatting guidelines:
- For code: always use fenced code blocks with the language specified, e.g. \`\`\`python or \`\`\`javascript

CRITICAL — Math / LaTeX formatting rules (you MUST follow these exactly):
- ALL math, including simple exponents like 2^3 or variables like x, MUST be wrapped in dollar-sign delimiters.
- Use $...$ for inline math. Example: The area is $A = \\pi r^2$.
- Use $$...$$ for display/block math. Example: $$E = mc^2$$
- NEVER write bare math expressions without dollar signs. Wrong: 2^3 = 8. Correct: $2^3 = 8$.
- NEVER use \\[ \\] or \\( \\) delimiters. ONLY use $ and $$.
- Every exponent (^), subscript (_), fraction (\\frac), square root (\\sqrt), and any other LaTeX command MUST be inside $ or $$ delimiters.
- In tables, wrap each math cell in $ delimiters: | $2^3$ | $8$ |`;

export const FACT_EXTRACTION_PROMPT = `Extract 0-3 key facts or pieces of knowledge from this conversation exchange.
Return a JSON array of strings. Each fact should be a concise, self-contained statement.
If the exchange is casual/trivial with no meaningful information, return an empty array.
Only return the JSON array, nothing else.`;

export const PREVIEW_PROMPT =
  "Summarize this branch of conversation in 1-2 sentences. Focus on the key topic and what was explored. Be concise.";

export const SELECTION_SUMMARY_PROMPT =
  "You will receive a text excerpt selected by the user. If it is a single word or short phrase, give a concise definition or explanation. If it is a longer passage, summarize it in 1 brief sentence. Reply with ONLY the definition or summary — no greetings, no preamble, no offers to help.";

export function getSelectionSummaryPrompt(sentences: number): string {
  return `You will receive a text excerpt selected by the user. If it is a single word or short phrase, give a concise definition or explanation. If it is a longer passage, summarize it in ${sentences} sentence${sentences === 1 ? "" : "s"} or fewer. Reply with ONLY the definition or summary — no greetings, no preamble, no offers to help.`;
}

export const DEFAULT_DECAY_LAMBDA = 0.0000001;
export const DEFAULT_SIMILARITY_WEIGHT = 0.7;
export const DEFAULT_TEMPORAL_WEIGHT = 0.3;
export const MEMORY_TOP_K = 5;
