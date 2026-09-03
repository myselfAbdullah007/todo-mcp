import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import express from "express";
import http from "node:http";
import path from "node:path";
import { listTodos } from "./db/supabase.js";
import { createTodoMcpServer } from "./server.js";

const port = Number(process.env.PORT) || 3001;
const hosted = Boolean(
  process.env.RENDER ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.NODE_ENV === "production"
);
const host = process.env.HOST ?? (hosted ? "0.0.0.0" : "127.0.0.1");

const handler = createMcpHandler(() => createTodoMcpServer());
const node = toNodeHandler(handler);

const app = createMcpExpressApp({ host });

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "todo-mcp",
  });
});

app.get("/api/todos", async (_req, res) => {
  try {
    const todos = await listTodos();
    res.set("Cache-Control", "no-store");
    res.json({ todos });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load todos",
    });
  }
});

app.all("/mcp", (req, res) => {
  void node(req, res, req.body);
});

app.use(express.static(path.join(process.cwd(), "public")));

const server = http.createServer(app);

server.on("error", (error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

server.listen(port, host, () => {
  const origin = hosted
    ? `port ${port}`
    : `http://127.0.0.1:${port}`;
  console.log(`Todo MCP Server listening on ${origin}`);
  if (!hosted) {
    console.log(`Board:  http://127.0.0.1:${port}/`);
    console.log(`Health: http://127.0.0.1:${port}/health`);
    console.log(`MCP:    http://127.0.0.1:${port}/mcp`);
    console.log("Keep this terminal open. Ctrl+C stops the server.");
  }
});
