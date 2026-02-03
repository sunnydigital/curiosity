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
  if (sentences <= 1) {
    return "You will receive a text excerpt selected by the user. If it is a single word or short phrase, give a one-line definition. If it is a longer passage, distill it into 1 brief sentence capturing the core idea. Reply with ONLY the definition or summary — no greetings, no preamble, no offers to help.";
  }
  if (sentences <= 2) {
    return "You will receive a text excerpt selected by the user. If it is a single word or short phrase, give a concise definition or explanation in 1-2 sentences. If it is a longer passage, summarize it in 2 sentences or fewer — state the main point, then one supporting detail. Reply with ONLY the definition or summary — no greetings, no preamble, no offers to help.";
  }
  if (sentences <= 3) {
    return "You will receive a text excerpt selected by the user. Provide a short summary in 1 paragraph of up to 3 sentences. Cover the main idea and key supporting points. Reply with ONLY the summary — no greetings, no preamble, no offers to help.";
  }
  if (sentences <= 5) {
    return "You will receive a text excerpt selected by the user. Provide a thorough summary in 1 paragraph of 3-5 sentences. Cover the main idea, key details, and any important nuances or implications. Reply with ONLY the summary — no greetings, no preamble, no offers to help.";
  }
  if (sentences <= 7) {
    return "You will receive a text excerpt selected by the user. Go more in-depth: provide a detailed summary in 1-2 paragraphs (5-7 sentences total). Explain the main idea, delve into important details, and note any significant context or implications. Reply with ONLY the summary — no greetings, no preamble, no offers to help.";
  }
  // 8-10
  return "You will receive a text excerpt selected by the user. Provide a comprehensive, in-depth analysis in 2-3 paragraphs (8-10 sentences total). Thoroughly explain the main ideas, delve into all important details, discuss context and implications, and highlight any notable connections or nuances. Reply with ONLY the analysis — no greetings, no preamble, no offers to help.";
}

export const DEFAULT_DECAY_LAMBDA = 0.0000001;
export const DEFAULT_SIMILARITY_WEIGHT = 0.7;
export const DEFAULT_TEMPORAL_WEIGHT = 0.3;
export const MEMORY_TOP_K = 5;
