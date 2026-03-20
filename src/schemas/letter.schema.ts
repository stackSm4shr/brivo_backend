import { z } from "zod";

const explainResultSchema = z.object({
  mode: z.literal("explain"),
  title: z.string(),
  summary: z.string(),
  plainLanguageExplanation: z.string(),
  requiredActions: z.array(z.string()),
  deadlines: z.array(z.string()),
  risks: z.array(z.string()),
});

const draftReplyResultSchema = z.object({
  mode: z.literal("draft-reply"),
  title: z.string(),
  intentSummary: z.string(),
  suggestedReplySubject: z.string(),
  suggestedReply: z.string(),
  missingInformation: z.array(z.string()),
  toneNotes: z.array(z.string()),
});

const translateResultSchema = z.object({
  mode: z.literal("translate"),
  title: z.string(),
  targetLanguage: z.string(),
  translatedText: z.string(),
  notes: z.array(z.string()),
});

export const aiResultSchema = z.discriminatedUnion("mode", [
  explainResultSchema,
  draftReplyResultSchema,
  translateResultSchema,
]);

export const createLetterSchema = z.object({
  fileName: z.string().min(1).max(255).optional(),
  action: z.enum(["explain", "draft-reply", "translate"]),
  sanitizedText: z
    .string()
    .min(30, "Document text is too short")
    .max(30000, "Document text is too long"),
  aiResult: aiResultSchema,
});

export type CreateLetterInput = z.infer<typeof createLetterSchema>;