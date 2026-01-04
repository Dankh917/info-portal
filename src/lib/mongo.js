import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const dbName = process.env.MONGODB_DB || "info-portal";

/**
 * Reuse a single Mongo client between hot reloads to avoid opening
 * multiple connections in dev.
 */
const globalWithMongo = globalThis;

let clientPromise = globalWithMongo._mongoClientPromise;

if (!clientPromise) {
  const client = new MongoClient(uri);
  clientPromise = client.connect();
  globalWithMongo._mongoClientPromise = clientPromise;
}

export async function getUpdatesCollection() {
  const client = await clientPromise;
  const db = client.db(dbName);
  return db.collection("Updates");
}

export async function getTagsCollection() {
  const client = await clientPromise;
  const db = client.db(dbName);
  return db.collection("Tags");
}

export async function getDocumentsCollection() {
  const client = await clientPromise;
  const db = client.db(dbName);
  return db.collection("Documents");
}
