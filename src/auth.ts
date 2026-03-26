import "dotenv/config";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { connectToDatabase, client } from "./db.js";

const { db } = await connectToDatabase();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    process.env.CORS_ORIGIN,
    "http://localhost:3000",
  ].filter((origin): origin is string => Boolean(origin)),
  emailAndPassword: {
    enabled: true,
  },
  database: mongodbAdapter(db, { client }),
  advanced: {
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },
});

export type Session = typeof auth.$Infer.Session;