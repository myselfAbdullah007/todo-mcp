import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { deleteTodo } from "../db/supabase.js";
import { toolError } from "../types/todo.js";

export function registerDeleteTodo(server: McpServer): void {
  server.registerTool(
    "delete_todo",
    {
      title: "Delete Todo",
      description: "Permanently delete a todo by id",
      inputSchema: z.object({
        id: z.string().uuid().describe("The todo id"),
      }),
    },
    async ({ id }) => {
      try {
        await deleteTodo(id);
        return {
          content: [{ type: "text", text: "Todo deleted successfully." }],
        };
      } catch (error) {
        return toolError(error, "Failed to delete todo");
      }
    }
  );
}
