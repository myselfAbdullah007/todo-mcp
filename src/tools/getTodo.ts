import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getTodo } from "../db/supabase.js";
import { formatTodo, toolError } from "../types/todo.js";

export function registerGetTodo(server: McpServer): void {
  server.registerTool(
    "get_todo",
    {
      title: "Get Todo",
      description: "Get a single todo by id",
      inputSchema: z.object({
        id: z.string().uuid().describe("The todo id"),
      }),
    },
    async ({ id }) => {
      try {
        const todo = await getTodo(id);
        return {
          content: [{ type: "text", text: formatTodo(todo) }],
        };
      } catch (error) {
        return toolError(error, "Failed to get todo");
      }
    }
  );
}
