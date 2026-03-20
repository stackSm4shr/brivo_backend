import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { createLetterSchema } from "../schemas/letter.schema.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  validateBody(createLetterSchema),
  async (req: Request, res: Response) => {
    try {
      const { db } = await connectToDatabase();

      const doc = {
        userId: req.user!.id,
        fileName: req.body.fileName ?? null,
        action: req.body.action,
        sanitizedText: req.body.sanitizedText,
        aiResult: req.body.aiResult,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection("letters").insertOne(doc);

      const letter = await db.collection("letters").findOne({
        _id: result.insertedId,
        userId: req.user!.id,
      });

      return res.status(201).json({ letter });
    } catch (error) {
      console.error("POST /api/letters error:", error);
      return res.status(500).json({ error: "Failed to save letter" });
    }
  },
);

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await connectToDatabase();

    const letters = await db
      .collection("letters")
      .find(
        { userId: req.user!.id },
        {
          projection: {
            fileName: 1,
            action: 1,
            sanitizedText: 1,
            aiResult: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .toArray();

    const items = letters.map((letter) => ({
      ...letter,
      preview:
        typeof letter.sanitizedText === "string"
          ? letter.sanitizedText.slice(0, 180)
          : "",
    }));

    return res.json({ letters: items });
  } catch (error) {
    console.error("GET /api/letters error:", error);
    return res.status(500).json({ error: "Failed to fetch letters" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await connectToDatabase();
    const rawId = req.params.id;

    if (typeof rawId !== "string" || !ObjectId.isValid(rawId)) {
      return res.status(400).json({ error: "Invalid letter id" });
    }

    const letterId = new ObjectId(rawId);

    const letter = await db.collection("letters").findOne({
      _id: letterId,
      userId: req.user!.id,
    });

    if (!letter) {
      return res.status(404).json({ error: "Letter not found" });
    }

    return res.json({ letter });
  } catch (error) {
    console.error("GET /api/letters/:id error:", error);
    return res.status(500).json({ error: "Failed to fetch letter" });
  }
});

export default router;