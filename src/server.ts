import { McpServer } from "@modelcontextprotocol/server";
import { registerCompleteTodo } from "./tools/completeTodo.js";
import { registerCreateTodo } from "./tools/createTodo.js";
import { registerDeleteTodo } from "./tools/deleteTodo.js";
import { registerGetTodo } from "./tools/getTodo.js";
import { registerListTodos } from "./tools/listTodos.js";
import { registerUpdateTodo } from "./tools/updateTodo.js";

export function createTodoMcpServer(): McpServer {
  const server = new McpServer({
    name: "todo-mcp",
    version: "1.0.0",
  });

  registerCreateTodo(server);
  registerListTodos(server);
  registerGetTodo(server);
  registerUpdateTodo(server);
  registerCompleteTodo(server);
  registerDeleteTodo(server);

  return server;
}
