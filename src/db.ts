import "dotenv/config";
import { MongoClient, ServerApiVersion, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri) {
  throw new Error("Missing MONGODB_URI in .env");
}

if (!dbName) {
  throw new Error("Missing MONGODB_DB_NAME in .env");
}

export const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (db) {
    return { client, db };
  }

  await client.connect();
  db = client.db(dbName);

  await db.command({ ping: 1 });
  console.log("Connected to MongoDB Atlas");

  return { client, db };
}

process.on("SIGINT", async () => {
  await client.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await client.close();
  process.exit(0);
});