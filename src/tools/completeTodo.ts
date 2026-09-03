import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { completeTodo } from "../db/supabase.js";
import { toolError } from "../types/todo.js";

export function registerCompleteTodo(server: McpServer): void {
  server.registerTool(
    "complete_todo",
    {
      title: "Complete Todo",
      description: "Mark a todo as completed",
      inputSchema: z.object({
        id: z.string().uuid().describe("The todo id"),
      }),
    },
    async ({ id }) => {
      try {
        await completeTodo(id);
        return {
          content: [{ type: "text", text: "Todo completed successfully." }],
        };
      } catch (error) {
        return toolError(error, "Failed to complete todo");
      }
    }
  );
}
