import { z } from "zod";

export const aiDocumentSchema = z.object({
  action: z.enum(["explain", "draft-reply"]),
  text: z
    .string()
    .min(30, "Document text is too short")
    .max(30000, "Document text is too long"),
  language: z.enum(["de", "en"]).optional().default("de"),
});

export type AiDocumentInput = z.infer<typeof aiDocumentSchema>;