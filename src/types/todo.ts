export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Todo = {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateTodoInput = {
  title: string;
  description?: string;
  priority?: Priority;
  due_date?: string;
};

export type UpdateTodoInput = {
  title?: string;
  description?: string;
  priority?: Priority;
  due_date?: string;
  completed?: boolean;
};

export type ListTodosFilter = {
  completed?: boolean;
  priority?: Priority;
};

export function statusLabel(completed: boolean): string {
  return completed ? "completed" : "pending";
}

export function formatTodoCreated(todo: Todo): string {
  return [
    "Todo created successfully.",
    "",
    `ID: ${todo.id}`,
    `Title: ${todo.title}`,
    `Priority: ${todo.priority}`,
  ].join("\n");
}

export function formatTodoList(todos: Todo[]): string {
  if (todos.length === 0) {
    return "No todos found.";
  }

  return todos
    .map(
      (todo, index) =>
        `${index + 1}. ${todo.title}\n   Priority: ${todo.priority}\n   Status: ${statusLabel(todo.completed)}`
    )
    .join("\n\n");
}

export function formatTodo(todo: Todo): string {
  return [
    `ID: ${todo.id}`,
    `Title: ${todo.title}`,
    `Description: ${todo.description ?? "(none)"}`,
    `Priority: ${todo.priority}`,
    `Status: ${statusLabel(todo.completed)}`,
    `Due date: ${todo.due_date ?? "(none)"}`,
    `Created: ${todo.created_at}`,
    `Updated: ${todo.updated_at}`,
  ].join("\n");
}

export function toolError(error: unknown, fallback: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : fallback,
      },
    ],
    isError: true as const,
  };
}
