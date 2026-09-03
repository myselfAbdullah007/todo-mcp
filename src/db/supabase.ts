import postgres from "postgres";
import type {
  CreateTodoInput,
  ListTodosFilter,
  Todo,
  UpdateTodoInput,
} from "../types/todo.js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable:\n${name}`);
  }
  return value;
}

const sql = postgres(requireEnv("DATABASE_URL"), { ssl: "require" });

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapTodo(row: Record<string, unknown>): Todo {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    completed: Boolean(row.completed),
    priority: String(row.priority),
    due_date: toDateOnly(row.due_date),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function setupTodosTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS todos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      completed BOOLEAN DEFAULT FALSE,
      priority TEXT DEFAULT 'medium',
      due_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const [row] = await sql`
    INSERT INTO todos (title, description, priority, due_date)
    VALUES (
      ${input.title},
      ${input.description ?? null},
      ${input.priority ?? "medium"},
      ${input.due_date ?? null}
    )
    RETURNING *
  `;
  return mapTodo(row as Record<string, unknown>);
}

export async function listTodos(filter: ListTodosFilter = {}): Promise<Todo[]> {
  const rows = await sql`
    SELECT * FROM todos
    WHERE (${filter.completed ?? null}::boolean IS NULL OR completed = ${filter.completed ?? null})
      AND (${filter.priority ?? null}::text IS NULL OR priority = ${filter.priority ?? null})
    ORDER BY created_at DESC
  `;
  return rows.map((row) => mapTodo(row as Record<string, unknown>));
}

export async function getTodo(id: string): Promise<Todo> {
  const [row] = await sql`SELECT * FROM todos WHERE id = ${id}`;
  if (!row) {
    throw new Error(`Todo not found: ${id}`);
  }
  return mapTodo(row as Record<string, unknown>);
}

export async function updateTodo(
  id: string,
  input: UpdateTodoInput
): Promise<Todo> {
  const patch: Record<string, unknown> = {
    updated_at: new Date(),
  };

  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.due_date !== undefined) patch.due_date = input.due_date;
  if (input.completed !== undefined) patch.completed = input.completed;

  const [row] = await sql`
    UPDATE todos SET ${sql(patch)} WHERE id = ${id} RETURNING *
  `;
  if (!row) {
    throw new Error(`Todo not found: ${id}`);
  }
  return mapTodo(row as Record<string, unknown>);
}

export async function completeTodo(id: string): Promise<Todo> {
  return updateTodo(id, { completed: true });
}

export async function deleteTodo(id: string): Promise<void> {
  const [row] = await sql`DELETE FROM todos WHERE id = ${id} RETURNING id`;
  if (!row) {
    throw new Error(`Todo not found: ${id}`);
  }
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
