import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createTodo } from "../db/supabase.js";
import { formatTodoCreated, toolError } from "../types/todo.js";

export function registerCreateTodo(server: McpServer): void {
  server.registerTool(
    "create_todo",
    {
      title: "Create Todo",
      description: "Create a new todo item in Supabase",
      inputSchema: z.object({
        title: z.string().min(1).describe("The todo title"),
        description: z.string().optional().describe("Optional details"),
        priority: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe("Priority level. Defaults to medium"),
        due_date: z
          .string()
          .optional()
          .describe("Due date in YYYY-MM-DD format"),
      }),
    },
    async ({ title, description, priority, due_date }) => {
      try {
        const todo = await createTodo({
          title,
          description,
          priority,
          due_date,
        });
        return {
          content: [{ type: "text", text: formatTodoCreated(todo) }],
        };
      } catch (error) {
        return toolError(error, "Failed to create todo");
      }
    }
  );
}
