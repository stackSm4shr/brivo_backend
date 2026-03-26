import OpenAI from "openai";
import type { AiDocumentInput } from "../schemas/ai.schema.js";

export type DeadlineItem = {
  label: string;
  rawText: string;
  isoDate: string | null;
  confidence: "high" | "medium" | "low";
};

type ExplainResult = {
  mode: "explain";
  title: string;
  summary: string;
  plainLanguageExplanation: string;
  requiredActions: string[];
  deadlines: DeadlineItem[];
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

const model =
  process.env.AI_MODEL ??
  (provider === "groq" ? "openai/gpt-oss-20b" : "qwen3:8b");

const baseURL =
  process.env.AI_BASE_URL ??
  (provider === "groq"
    ? "https://api.groq.com/openai/v1"
    : "http://localhost:11434/v1");

const apiKey =
  process.env.AI_API_KEY ??
  (provider === "groq" ? process.env.GROQ_API_KEY : "ollama");

if (!apiKey) {
  throw new Error("Missing AI_API_KEY / GROQ_API_KEY");
}

const client = new OpenAI({
  apiKey,
  baseURL,
});

function buildInstructions(input: AiDocumentInput) {
  if (input.action === "explain") {
    return `
You are an expert bureaucracy assistant.

Your task is to explain an official letter in plain English.

CRITICAL LANGUAGE RULES:
- All output fields except "mode" MUST be written in English.
- Do NOT write any German in title, summary, plainLanguageExplanation, requiredActions, deadlines, or risks.
- Even if the source document is German, your explanation must be fully in English.
- Translate quoted or paraphrased content into English.

QUALITY RULES:
- Explain official letters clearly, carefully, and conservatively.
- Do not invent facts that are not present in the document.
- Do not give legal guarantees.
- Only extract deadlines that are explicitly stated or strongly implied by the letter.
- If no deadline is present, return an empty deadlines array.
- If a deadline is vague and cannot be normalized safely, set isoDate to null.
- Keep rawText close to the wording in the document.
- label should be a short English action label.
- confidence must be one of: high, medium, low.
- Return valid JSON only.

Schema:
{
  "mode": "explain",
  "title": "string",
  "summary": "string",
  "plainLanguageExplanation": "string",
  "requiredActions": ["string"],
  "deadlines": [
    {
      "label": "string",
      "rawText": "string",
      "isoDate": "string|null",
      "confidence": "high|medium|low"
    }
  ],
  "risks": ["string"]
}
    `.trim();
  }

  if (input.action === "draft-reply") {
    const answerLanguage =
      input.language === "de"
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

  return `
You are a professional translator.

Translate the provided document into ${input.targetLanguage ?? "English"}.

RULES:
- Preserve meaning faithfully.
- Keep names, IDs, addresses, and reference numbers unchanged unless they must be transliterated.
- Do not summarize.
- Do not explain unless needed briefly in notes.
- Return valid JSON only.

Schema:
{
  "mode": "translate",
  "title": "string",
  "targetLanguage": "string",
  "translatedText": "string",
  "notes": ["string"]
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
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            rawText: { type: "string" },
            isoDate: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
          },
          required: ["label", "rawText", "isoDate", "confidence"],
        },
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

function translateSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { type: "string", const: "translate" },
      title: { type: "string" },
      targetLanguage: { type: "string" },
      translatedText: { type: "string" },
      notes: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["mode", "title", "targetLanguage", "translatedText", "notes"],
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

async function analyzeWithGroq(input: AiDocumentInput): Promise<AiResult> {
  const schema =
    input.action === "explain"
      ? explainSchema()
      : input.action === "draft-reply"
        ? draftReplySchema()
        : translateSchema();

  const instructions = buildInstructions(input);

  const userPrompt =
    input.action === "explain"
      ? `Explain the following document in English only.
Every JSON field except "mode" must be in English.

Document text:

${input.text}`
      : input.action === "draft-reply"
        ? `Draft a reply to the following document.

Document text:

${input.text}`
        : `Translate the following document into ${input.targetLanguage ?? "English"}.

Document text:

${input.text}`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.00000001,
    messages: [
      {
        role: "system",
        content: instructions,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "bureaucracy_ai_result",
        strict: true,
        schema,
      },
    },
  });

  const output = response.choices[0]?.message?.content;
  if (!output) {
    throw new Error("Model returned empty output");
  }

  return safeJsonParse<AiResult>(output);
}

async function analyzeWithOllama(input: AiDocumentInput): Promise<AiResult> {
  const schema =
    input.action === "explain"
      ? explainSchema()
      : input.action === "draft-reply"
        ? draftReplySchema()
        : translateSchema();

  const instructions = buildInstructions(input);

  const userPrompt =
    input.action === "explain"
      ? `Explain the following document in English only.
Every JSON field except "mode" must be in English.

Document text:

${input.text}`
      : input.action === "draft-reply"
        ? `Draft a reply to the following document.

Document text:

${input.text}`
        : `Translate the following document into ${input.targetLanguage ?? "English"}.

Document text:

${input.text}`;

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
        content: userPrompt,
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

export async function analyzeDocument(
  input: AiDocumentInput,
): Promise<AiResult> {
  if (provider === "groq") {
    return analyzeWithGroq(input);
  }

  return analyzeWithOllama(input);
}