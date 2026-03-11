import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import usersRouter from "./routes/users.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/users", usersRouter);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});