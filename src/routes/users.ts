import { Router, type Request, type Response } from "express";
import { auth } from "../auth.js";
import { requireAuth } from "../middleware/require-auth.js";
import { connectToDatabase } from "../db.js";
import { updateUserSchema, profileSchema } from "../schemas/user.schema.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

type ProfileDoc = {
  userId: string;
  bio: string;
  location: string;
  website: string;
  createdAt?: Date;
  updatedAt: Date;
};

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      user: req.user,
      session: req.session,
    });
  } catch (error) {
    console.error("GET /api/users/me error:", error);
    res.status(500).json({ error: "Failed to fetch current user" });
  }
});

router.patch(
  "/me",
  requireAuth,
  validateBody(updateUserSchema),
  async (req: Request, res: Response) => {
    try {
      const updates = req.body;

      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else if (value) {
          headers.set(key, value);
        }
      });

      const updatedUser = await auth.api.updateUser({
        headers,
        body: updates,
      });

      res.json({
        message: "User updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Failed to update user",
      });
    }
  }
);

router.put(
  "/me/profile",
  requireAuth,
  validateBody(profileSchema),
  async (req: Request, res: Response) => {
    try {
      const { db } = await connectToDatabase();
      const data = req.body;

      await db.collection("profiles").updateOne(
        { userId: req.user!.id },
        {
          $set: {
            ...data,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      const profile = await db.collection("profiles").findOne({
        userId: req.user!.id,
      });

      res.json({
        message: "Profile updated",
        profile,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Failed to update profile",
      });
    }
  }
);
router.delete("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await connectToDatabase();

    await db.collection("profiles").deleteOne({
      userId: req.user!.id,
    });

    res.json({
      message: "Profile data deleted",
    });
  } catch (error) {
    console.error("DELETE /api/users/me error:", error);
    res.status(500).json({ error: "Failed to delete profile data" });
  }
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { db } = await connectToDatabase();
    const { id } = req.params;

    const profile = await db.collection<ProfileDoc>("profiles").findOne(
      { userId: id },
      {
        projection: {
          _id: 0,
          userId: 1,
          bio: 1,
          location: 1,
          website: 1,
        },
      },
    );

    if (!profile) {
      res.status(404).json({ error: "User profile not found" });
      return;
    }

    res.json({ profile });
  } catch (error) {
    console.error("GET /api/users/:id error:", error);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

export default router;
