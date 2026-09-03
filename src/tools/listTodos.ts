import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listTodos } from "../db/supabase.js";
import { formatTodoList, toolError } from "../types/todo.js";

export function registerListTodos(server: McpServer): void {
  server.registerTool(
    "list_todos",
    {
      title: "List Todos",
      description: "List todos, optionally filtered by completion status or priority",
      inputSchema: z.object({
        completed: z
          .boolean()
          .optional()
          .describe("Filter by completion status"),
        priority: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe("Filter by priority"),
      }),
    },
    async ({ completed, priority }) => {
      try {
        const todos = await listTodos({ completed, priority });
        return {
          content: [{ type: "text", text: formatTodoList(todos) }],
        };
      } catch (error) {
        return toolError(error, "Failed to list todos");
      }
    }
  );
}
