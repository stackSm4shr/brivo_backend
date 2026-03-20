import { Router } from "express";
import { analyzeDocument } from "../services/ai.service.js";
import { validateBody } from "../middleware/validate.js";
import { aiDocumentSchema } from "../schemas/ai.schema.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

router.post(
  "/document",
  requireAuth,
  validateBody(aiDocumentSchema),
  async (req, res) => {
    try {
      const result = await analyzeDocument(req.body);
      res.json({ result });
    } catch (error) {
      console.error("AI document route error:", error);
      res.status(500).json({ error: "Failed to analyze document" });
    }
  },
);

export default router;