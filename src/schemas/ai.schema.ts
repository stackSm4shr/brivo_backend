import { z } from "zod";

export const aiDocumentSchema = z
  .object({
    action: z.enum(["explain", "draft-reply", "translate"]),
    text: z
      .string()
      .min(30, "Document text is too short")
      .max(30000, "Document text is too long"),
    language: z.enum(["de", "en"]).optional().default("de"),
    targetLanguage: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "translate" && !data.targetLanguage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetLanguage"],
        message: "targetLanguage is required for translate action",
      });
    }
  });

export type AiDocumentInput = z.infer<typeof aiDocumentSchema>;