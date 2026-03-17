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

export type AiResult = ExplainResult | DraftReplyResult;

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
  action: AiDocumentInput["action"],
  language: "de" | "en",
) {
  if (action === "explain") {
    return `
You are an expert bureaucracy assistant.

Your task is to explain an official letter in plain English.

CRITICAL LANGUAGE RULES:
- All output fields except "mode" MUST be written in English.
- Do NOT write any German in title, summary, plainLanguageExplanation, requiredActions, deadlines, or risks.
- Even if the source document is German, your explanation must be fully in English.
- Translate quoted or paraphrased content into English.
- If a term appears in German in the source, explain it in English.

QUALITY RULES:
- Explain official letters clearly, carefully, and conservatively.
- Do not invent facts that are not present in the document.
- Do not give legal guarantees.
- If a deadline is unclear, say that it is unclear.
- Use simple wording suitable for non-experts.

Return valid JSON only.

Schema:
{
  "mode": "explain",
  "title": "string",
  "summary": "string",
  "plainLanguageExplanation": "string",
  "requiredActions": ["string"],
  "deadlines": ["string"],
  "risks": ["string"]
}
`.trim();
  }

  const answerLanguage =
    language === "de"
      ? "Write the answer in German."
      : "Write the answer in English.";

  return `
You are an expert bureaucracy assistant.
Draft a polite and useful reply to an official letter.
Do not invent personal facts, attachments, dates, promises, or legal claims.
If information is missing, list it under missingInformation.
Prefer a respectful and practical tone.

${answerLanguage}

Return valid JSON only.

Schema:
{
  "mode": "draft-reply",
  "title": "string",
  "intentSummary": "string",
  "suggestedReplySubject": "string",
  "suggestedReply": "string",
  "missingInformation": ["string"],
  "toneNotes": ["string"]
}
`.trim();
}

function explainSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { type: "string", const: "explain" },
      title: { type: "string" },
      summary: { type: "string" },
      plainLanguageExplanation: { type: "string" },
      requiredActions: {
        type: "array",
        items: { type: "string" },
      },
      deadlines: {
        type: "array",
        items: { type: "string" },
      },
      risks: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "mode",
      "title",
      "summary",
      "plainLanguageExplanation",
      "requiredActions",
      "deadlines",
      "risks",
    ],
  };
}

function draftReplySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { type: "string", const: "draft-reply" },
      title: { type: "string" },
      intentSummary: { type: "string" },
      suggestedReplySubject: { type: "string" },
      suggestedReply: { type: "string" },
      missingInformation: {
        type: "array",
        items: { type: "string" },
      },
      toneNotes: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "mode",
      "title",
      "intentSummary",
      "suggestedReplySubject",
      "suggestedReply",
      "missingInformation",
      "toneNotes",
    ],
  };
}

function safeJsonParse<T>(value: string): T {
  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}$/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new Error("Model did not return valid JSON");
  }
}

export async function analyzeDocument(
  input: AiDocumentInput,
): Promise<AiResult> {
  const schema =
    input.action === "explain" ? explainSchema() : draftReplySchema();

  const instructions = buildInstructions(input.action, input.language);

  const response = await client.responses.create({
    model,
    temperature: 0,
    input: [
      {
        role: "system",
        content: instructions,
      },
      {
        role: "user",
        content:
          input.action === "explain"
            ? `Explain the following document in English only. Every JSON field except "mode" must be in English.\n\nDocument text:\n\n${input.text}`
            : `Draft a reply to the following document.\n\nDocument text:\n\n${input.text}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "bureaucracy_ai_result",
        strict: true,
        schema,
      },
    },
  });

  const output = response.output_text;

  if (!output) {
    throw new Error("Model returned empty output");
  }

  return safeJsonParse<AiResult>(output);
}
