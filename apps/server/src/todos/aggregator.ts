import { db } from "../db/index.js";
import { todos } from "../db/schema.js";

export async function aggregateTodos() {
  // For now, just return local todos
  // Future: pull from Slack, GitHub, etc.
  return db.select().from(todos).all();
}
