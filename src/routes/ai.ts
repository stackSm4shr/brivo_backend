import { Router, type Request, type Response } from "express";
import { aiDocumentSchema } from "../schemas/ai.schema.js";
import { analyzeDocument } from "../services/ai.service.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

router.post(
  "/document",
  requireAuth,
  validateBody(aiDocumentSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await analyzeDocument(req.body);
      return res.json({ result });
    } catch (error) {
      console.error("POST /api/ai/document error:", error);

      return res.status(500).json({
        error: "Failed to analyze document",
      });
    }
  }
);

export default router;