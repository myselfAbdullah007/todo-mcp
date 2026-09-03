import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { updateTodo } from "../db/supabase.js";
import { formatTodo, toolError } from "../types/todo.js";

export function registerUpdateTodo(server: McpServer): void {
  server.registerTool(
    "update_todo",
    {
      title: "Update Todo",
      description: "Update fields on an existing todo",
      inputSchema: z.object({
        id: z.string().uuid().describe("The todo id"),
        title: z.string().min(1).optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        priority: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe("New priority"),
        due_date: z
          .string()
          .optional()
          .describe("New due date in YYYY-MM-DD format"),
        completed: z.boolean().optional().describe("New completion status"),
      }),
    },
    async ({ id, title, description, priority, due_date, completed }) => {
      try {
        const todo = await updateTodo(id, {
          title,
          description,
          priority,
          due_date,
          completed,
        });
        return {
          content: [
            {
              type: "text",
              text: `Todo updated successfully.\n\n${formatTodo(todo)}`,
            },
          ],
        };
      } catch (error) {
        return toolError(error, "Failed to update todo");
      }
    }
  );
}
