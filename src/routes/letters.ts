import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import crypto from "node:crypto";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  createLetterSchema,
  confirmDeadlineSchema,
} from "../schemas/letter.schema.js";

type ConfirmedDeadline = {
  id: string;
  title: string;
  date: string;
  rawText: string;
  createdAt: string;
  done: boolean;
};

type LetterDocument = {
  _id?: ObjectId;
  userId: string;
  fileName: string | null;
  action: "explain" | "draft-reply" | "translate";
  sanitizedText: string;
  aiResult: unknown;
  confirmedDeadlines: ConfirmedDeadline[];
  createdAt: Date;
  updatedAt: Date;
};

const router = Router();

router.post(
  "/",
  requireAuth,
  validateBody(createLetterSchema),
  async (req: Request, res: Response) => {
    try {
      const { db } = await connectToDatabase();
      const letters = db.collection<LetterDocument>("letters");

      const doc: LetterDocument = {
        userId: req.user!.id,
        fileName: req.body.fileName ?? null,
        action: req.body.action,
        sanitizedText: req.body.sanitizedText,
        aiResult: req.body.aiResult,
        confirmedDeadlines: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await letters.insertOne(doc);

      const letter = await letters.findOne({
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
    const lettersCollection = db.collection<LetterDocument>("letters");

    const letters = await lettersCollection
      .find(
        { userId: req.user!.id },
        {
          projection: {
            fileName: 1,
            action: 1,
            sanitizedText: 1,
            aiResult: 1,
            confirmedDeadlines: 1,
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

router.get(
  "/calendar/events",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { db } = await connectToDatabase();
      const lettersCollection = db.collection<LetterDocument>("letters");

      const letters = await lettersCollection
        .find(
          {
            userId: req.user!.id,
            confirmedDeadlines: { $exists: true, $ne: [] },
          },
          {
            projection: {
              fileName: 1,
              confirmedDeadlines: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .toArray();

      const events = letters.flatMap((letter) =>
        Array.isArray(letter.confirmedDeadlines)
          ? letter.confirmedDeadlines.map((deadline) => ({
              id: deadline.id,
              title: deadline.title,
              date: deadline.date,
              rawText: deadline.rawText,
              done: deadline.done ?? false,
              letterId: String(letter._id),
              fileName: letter.fileName ?? null,
            }))
          : [],
      );

      return res.json({ events });
    } catch (error) {
      console.error("GET /api/letters/calendar/events error:", error);
      return res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  },
);

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await connectToDatabase();
    const letters = db.collection<LetterDocument>("letters");
    const rawId = req.params.id;

    if (typeof rawId !== "string" || !ObjectId.isValid(rawId)) {
      return res.status(400).json({ error: "Invalid letter id" });
    }

    const letterId = new ObjectId(rawId);

    const letter = await letters.findOne({
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

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await connectToDatabase();
    const letters = db.collection<LetterDocument>("letters");
    const rawId = req.params.id;

    if (typeof rawId !== "string" || !ObjectId.isValid(rawId)) {
      return res.status(400).json({ error: "Invalid letter id" });
    }

    const letterId = new ObjectId(rawId);

    const result = await letters.deleteOne({
      _id: letterId,
      userId: req.user!.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Letter not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/letters/:id error:", error);
    return res.status(500).json({ error: "Failed to delete letter" });
  }
});

router.post(
  "/:id/confirm-deadline",
  requireAuth,
  validateBody(confirmDeadlineSchema),
  async (req: Request, res: Response) => {
    try {
      const { db } = await connectToDatabase();
      const letters = db.collection<LetterDocument>("letters");
      const rawId = req.params.id;

      if (typeof rawId !== "string" || !ObjectId.isValid(rawId)) {
        return res.status(400).json({ error: "Invalid letter id" });
      }

      const letterId = new ObjectId(rawId);

      const confirmedDeadline: ConfirmedDeadline = {
        id: crypto.randomUUID(),
        title: req.body.title,
        date: req.body.date,
        rawText: req.body.rawText,
        createdAt: new Date().toISOString(),
        done: false,
      };

      const result = await letters.findOneAndUpdate(
        { _id: letterId, userId: req.user!.id },
        {
          $push: { confirmedDeadlines: confirmedDeadline },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after" },
      );

      if (!result) {
        return res.status(404).json({ error: "Letter not found" });
      }

      return res.json({
        confirmedDeadline,
        letter: result,
      });
    } catch (error) {
      console.error("POST /api/letters/:id/confirm-deadline error:", error);
      return res.status(500).json({ error: "Failed to confirm deadline" });
    }
  },
);

router.delete(
  "/:letterId/deadlines/:deadlineId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { db } = await connectToDatabase();
      const letters = db.collection<LetterDocument>("letters");
      const rawLetterId = req.params.letterId;
      const deadlineId = req.params.deadlineId;

      if (typeof rawLetterId !== "string" || !ObjectId.isValid(rawLetterId)) {
        return res.status(400).json({ error: "Invalid letter id" });
      }

      if (!deadlineId) {
        return res.status(400).json({ error: "Invalid deadline id" });
      }

      const letterId = new ObjectId(rawLetterId);

      const result = await letters.findOneAndUpdate(
        { _id: letterId, userId: req.user!.id },
        {
          $pull: {
            confirmedDeadlines: { id: deadlineId } as Partial<ConfirmedDeadline>,
          },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after" },
      );

      if (!result) {
        return res.status(404).json({ error: "Letter not found" });
      }

      return res.json({ ok: true, letter: result });
    } catch (error) {
      console.error(
        "DELETE /api/letters/:letterId/deadlines/:deadlineId error:",
        error,
      );
      return res.status(500).json({ error: "Failed to delete deadline" });
    }
  },
);

router.patch(
  "/:letterId/deadlines/:deadlineId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { db } = await connectToDatabase();
      const letters = db.collection<LetterDocument>("letters");
      const rawLetterId = req.params.letterId;
      const deadlineId = req.params.deadlineId;
      const done = req.body?.done;

      if (typeof rawLetterId !== "string" || !ObjectId.isValid(rawLetterId)) {
        return res.status(400).json({ error: "Invalid letter id" });
      }

      if (!deadlineId) {
        return res.status(400).json({ error: "Invalid deadline id" });
      }

      if (typeof done !== "boolean") {
        return res.status(400).json({ error: "done must be boolean" });
      }

      const letterId = new ObjectId(rawLetterId);

      const result = await letters.findOneAndUpdate(
        {
          _id: letterId,
          userId: req.user!.id,
          "confirmedDeadlines.id": deadlineId,
        },
        {
          $set: {
            "confirmedDeadlines.$.done": done,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" },
      );

      if (!result) {
        return res.status(404).json({ error: "Deadline not found" });
      }

      return res.json({ ok: true, letter: result });
    } catch (error) {
      console.error(
        "PATCH /api/letters/:letterId/deadlines/:deadlineId error:",
        error,
      );
      return res.status(500).json({ error: "Failed to update deadline" });
    }
  },
);

export default router;