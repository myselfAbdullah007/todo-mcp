import { closeDb, setupTodosTable } from "../db/supabase.js";

await setupTodosTable();
console.log("todos table is ready.");
await closeDb();
