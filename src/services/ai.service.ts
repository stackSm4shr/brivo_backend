import OpenAI from "openai";
import type { AiDocumentInput } from "../schemas/ai.schema.js";

type ExplainResult = {
  mode: "explain";
  title: string;
  summary: string;
  plainLanguageExplanation: string;
  requiredActions: string[];
  deadlines: string[];
  risks: string[];
};

type DraftReplyResult = {
  mode: "draft-reply";
  title: string;
  intentSummary: string;
  suggestedReplySubject: string;
  suggestedReply: string;
  missingInformation: string[];
  toneNotes: string[];
};

type TranslateResult = {
  mode: "translate";
  title: string;
  targetLanguage: string;
  translatedText: string;
  notes: string[];
};

export type AiResult = ExplainResult | DraftReplyResult | TranslateResult;

const provider = process.env.AI_PROVIDER ?? "ollama";
const model = process.env.AI_MODEL ?? "qwen3:8b";
const baseURL =
  process.env.AI_BASE_URL ??
  (provider === "ollama" ? "http://localhost:11434/v1" : undefined);
const apiKey =
  process.env.AI_API_KEY ??
  (provider === "ollama" ? "ollama" : process.env.OPENAI_API_KEY);

if (!apiKey) {
  throw new Error("Missing AI_API_KEY / OPENAI_API_KEY");
}

const client = new OpenAI({
  apiKey,
  baseURL,
});

function buildInstructions(
  input: Pick<AiDocumentInput, "action" | "language" | "targetLanguage">,
) {
  const { action, targetLanguage } = input;

  // decide language automatically
  const language =
    action === "explain"
      ? "en"
      : action === "draft-reply"
      ? "de"
      : undefined;

  if (action === "explain") {
    return `
You are an expert bureaucracy assistant.

Analyze the provided document text and return strict JSON with exactly this shape:
{
  "mode": "explain",
  "title": string,
  "summary": string,
  "plainLanguageExplanation": string,
  "requiredActions": string[],
  "deadlines": string[],
  "risks": string[]
}

Rules:
- The response language must be English.
- Be accurate and concise.
- Do not invent facts not present in the text.
- If something is unclear, mention the uncertainty in summary or explanation.
- Return JSON only.
`.trim();
  }

  if (action === "draft-reply") {
    return `
You are an expert bureaucracy assistant.

Read the provided document text and draft a helpful reply. Return strict JSON with exactly this shape:
{
  "mode": "draft-reply",
  "title": string,
  "intentSummary": string,
  "suggestedReplySubject": string,
  "suggestedReply": string,
  "missingInformation": string[],
  "toneNotes": string[]
}

Rules:
- The response language must be German.
- The suggested reply should be polite, practical, and suitable for official communication.
- Do not fabricate case numbers, dates, names, or attachments.
- Mention missing details in "missingInformation".
- Return JSON only.
`.trim();
  }

  return `
You are an expert bureaucracy assistant.

Translate the provided document text and return strict JSON with exactly this shape:
{
  "mode": "translate",
  "title": string,
  "targetLanguage": string,
  "translatedText": string,
  "notes": string[]
}

Rules:
- Translate into ${targetLanguage}.
- Preserve meaning faithfully.
- Preserve names, dates, file references, account numbers, invoice numbers, and reference numbers exactly unless a direct translation is obviously appropriate.
- Do not add explanations inside the translated text.
- Use "notes" for short translator notes or warnings.
- Return JSON only.
`.trim();
}

function safeJsonParse<T>(value: string): T {
  return JSON.parse(value) as T;
}

export async function analyzeDocument(input: AiDocumentInput): Promise<AiResult> {
  const instructions = buildInstructions(input);

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: input.text },
    ],
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("AI returned an empty response");
  }

  const parsed = safeJsonParse<AiResult>(content);

  if (input.action === "explain") {
    if (
      parsed.mode !== "explain" ||
      !parsed.title ||
      !parsed.summary ||
      !parsed.plainLanguageExplanation ||
      !Array.isArray(parsed.requiredActions) ||
      !Array.isArray(parsed.deadlines) ||
      !Array.isArray(parsed.risks)
    ) {
      throw new Error("AI returned an invalid explain result");
    }

    return parsed;
  }

  if (input.action === "draft-reply") {
    if (
      parsed.mode !== "draft-reply" ||
      !parsed.title ||
      !parsed.intentSummary ||
      !parsed.suggestedReplySubject ||
      !parsed.suggestedReply ||
      !Array.isArray(parsed.missingInformation) ||
      !Array.isArray(parsed.toneNotes)
    ) {
      throw new Error("AI returned an invalid draft reply result");
    }

    return parsed;
  }

  if (
    parsed.mode !== "translate" ||
    !parsed.title ||
    !parsed.targetLanguage ||
    !parsed.translatedText ||
    !Array.isArray(parsed.notes)
  ) {
    throw new Error("AI returned an invalid translate result");
  }

  return parsed;
}