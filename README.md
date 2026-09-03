# Todo MCP Server

Remote MCP Todo server for teaching:

**Human → Claude → Streamable HTTP MCP → Node.js → PostgreSQL → Desk UI**

This README is the lecture notes for the project. It covers **what Claude actually sees**, **how MCP works in this codebase**, and **every hop from a chat message to a database row**.

GitHub renders the Mermaid blocks as diagrams.

**Live demo**

| Surface | URL |
| --- | --- |
| Desk (browser) | https://todo-mcp-k1gg.onrender.com/ |
| MCP (Claude) | https://todo-mcp-k1gg.onrender.com/mcp |
| Health | https://todo-mcp-k1gg.onrender.com/health |

---

## Table of contents

1. [What is MCP?](#1-what-is-mcp)
2. [Stdio vs Streamable HTTP](#2-stdio-vs-streamable-http)
3. [System architecture](#3-system-architecture)
4. [What Claude sees](#4-what-claude-sees)
5. [How Claude decides to call a tool](#5-how-claude-decides-to-call-a-tool)
6. [Wire format (JSON-RPC)](#6-wire-format-json-rpc)
7. [Request lifecycle](#7-request-lifecycle)
8. [Code map](#8-code-map)
9. [Database layer](#9-database-layer)
10. [Desk UI](#10-desk-ui)
11. [Two clients, one database](#11-two-clients-one-database)
12. [Security model](#12-security-model)
13. [Tools reference](#13-tools-reference)
14. [How to add another tool](#14-how-to-add-another-tool)
15. [Setup, deploy, connect Claude](#15-setup-deploy-connect-claude)
16. [Troubleshooting](#16-troubleshooting)
17. [Live demo script](#17-live-demo-script)

---

## 1. What is MCP?

**Model Context Protocol (MCP)** is an open standard for connecting an AI app to external tools and data.

Without MCP, every AI product needs a custom integration for every backend (custom REST, custom auth, custom docs for the model).

With MCP, the contract is shared:

| Role | In this project | Job |
| --- | --- | --- |
| **MCP client** | Claude (claude.ai / Desktop / Cowork) | Discovers tools, chooses one, sends arguments |
| **MCP server** | This Node app | Registers tools, runs them, returns results |
| **Transport** | Streamable HTTP on `POST /mcp` | How client and server talk |
| **Backing store** | Supabase PostgreSQL `todos` | Where data actually lives |

Claude does **not** know SQL. Claude does **not** hold `DATABASE_URL`. Claude only knows:

> There is a remote server named `todo-mcp` with tools `create_todo`, `list_todos`, `get_todo`, `update_todo`, `complete_todo`, `delete_todo`.

Your server implements those tools. That is the whole idea.

```mermaid
flowchart LR
  U[Human] -->|English| C[Claude<br/>MCP client]
  C -->|JSON-RPC / HTTPS| M["Todo MCP Server<br/>/mcp"]
  M -->|parameterized SQL| D[(Supabase<br/>PostgreSQL)]
  D -->|row| M
  M -->|tool result text| C
  C -->|English| U
```

MCP can also expose **resources** (readable data) and **prompts** (reusable templates). This classroom server uses **tools only** — actions with side effects — because the lecture is “Claude writes to a real database.”

---

## 2. Stdio vs Streamable HTTP

MCP has two common transports. Mixing them up is the usual demo failure.

```mermaid
flowchart TB
  subgraph Local["Local / stdio"]
    L1[Claude Desktop]
    L2[spawns node as a child process]
    L3[stdin / stdout JSON-RPC]
    L1 --> L2 --> L3
  end

  subgraph Remote["Remote / Streamable HTTP — this project"]
    R1[Claude cloud]
    R2["HTTPS POST https://….onrender.com/mcp"]
    R3[Express + MCP SDK]
    R1 --> R2 --> R3
  end
```

| | stdio | Streamable HTTP (this repo) |
| --- | --- | --- |
| Where the server runs | On the user’s laptop | On Render (or any host) |
| How Claude reaches it | Spawns a process | Public URL |
| Config | `claude_desktop_config.json` | Custom connector |
| Good for | Local files, local DBs | Classroom demos, shared tools |

Claude custom connectors always connect **from Anthropic’s cloud**, not from your laptop. `http://localhost:3001/mcp` will not work as a Claude connector. Use the Render URL.

---

## 3. System architecture

One Node process serves four HTTP surfaces:

| URL | Method | Who | Protocol |
| --- | --- | --- | --- |
| `/mcp` | all (POST in practice) | Claude, MCP Inspector | MCP Streamable HTTP |
| `/api/todos` | GET | Desk browser | JSON `{ todos: [...] }` |
| `/` | GET | Humans | Static `public/` |
| `/health` | GET | Render health check | `{ status, service }` |

```mermaid
flowchart TB
  subgraph Clients
    Claude["Claude<br/>Custom Connector"]
    Browser["Browser<br/>Desk"]
    Inspector["MCP Inspector<br/>optional"]
  end

  subgraph Process["todo-mcp on Render — one Node process"]
    direction TB
    MCP["/mcp<br/>createMcpHandler + toNodeHandler"]
    API["/api/todos<br/>listTodos()"]
    Static["/<br/>public/index.html"]
    Health["/health"]
    Tools["McpServer<br/>6 tools"]
    DB["src/db/supabase.ts<br/>postgres.js"]
  end

  subgraph Data
    PG[("todos")]
  end

  Claude -->|HTTPS| MCP
  Inspector -->|HTTPS| MCP
  Browser -->|poll 2s| API
  Browser --> Static
  MCP --> Tools --> DB --> PG
  API --> DB
```

### Stack

| Piece | Package / product |
| --- | --- |
| Runtime | Node 20+ |
| Language | TypeScript |
| HTTP | Express 5 |
| MCP | `@modelcontextprotocol/server`, `/express`, `/node` |
| Validation | Zod (tool input schemas) |
| Database client | `postgres` (postgres.js) |
| Database | Supabase PostgreSQL |
| Host | Render Web Service |

### Why Claude cannot use localhost

```mermaid
flowchart LR
  You[Your laptop] -->|chat in browser| Claude[Claude / Anthropic cloud]
  Claude -->|must be public HTTPS| Render[Render /mcp]
  You -.->|localhost is invisible<br/>to Anthropic| Render
```

---

## 4. What Claude sees

After you add the custom connector, Claude does **not** receive your repo, `.env`, or SQL.

Claude receives a **tool catalog**: name, title, description, JSON Schema for inputs.

```mermaid
flowchart TB
  S["Server identity: todo-mcp @ 1.0.0"]
  S --> T1["create_todo"]
  S --> T2["list_todos"]
  S --> T3["get_todo"]
  S --> T4["update_todo"]
  S --> T5["complete_todo"]
  S --> T6["delete_todo"]
```

That catalog is built in `src/server.ts` by calling `registerTool` six times. The SDK converts each Zod `inputSchema` into JSON Schema for the client.

### `create_todo` as Claude sees it

After `tools/list`, conceptually:

```json
{
  "name": "create_todo",
  "title": "Create Todo",
  "description": "Create a new todo item in Supabase",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "minLength": 1,
        "description": "The todo title"
      },
      "description": {
        "type": "string",
        "description": "Optional details"
      },
      "priority": {
        "type": "string",
        "enum": ["low", "medium", "high"],
        "description": "Priority level. Defaults to medium"
      },
      "due_date": {
        "type": "string",
        "description": "Due date in YYYY-MM-DD format"
      }
    },
    "required": ["title"]
  }
}
```

The `.describe(...)` strings on Zod fields matter. They are how Claude knows `priority` is `low | medium | high` and that `due_date` is `YYYY-MM-DD`.

### Text Claude gets back (not HTML)

Handlers return MCP content blocks. Example from `formatTodoCreated`:

```text
Todo created successfully.

ID: f660cf06-cf40-40db-a7df-60b16356696b
Title: Prepare MCP Masterclass
Priority: high
```

`list_todos` returns a numbered list via `formatTodoList`. `get_todo` returns a field dump via `formatTodo`. Claude paraphrases that text for the human.

### Visible vs hidden

```mermaid
flowchart LR
  subgraph Visible["Sent to Claude"]
    A[Tool names]
    B[Titles + descriptions]
    C[JSON Schema]
    D[Result text / isError]
  end

  subgraph Hidden["Never sent to Claude"]
    E[DATABASE_URL]
    F[SQL]
    G[TypeScript source]
    H[Render env]
    I[postgres.js connection pool]
  end
```

---

## 5. How Claude decides to call a tool

Claude is not a router you program. It is a model that **chooses** a tool from the catalog given the user message.

```mermaid
flowchart TD
  M[User message] --> C{Does a tool match?}
  C -->|yes| P[Fill args from schema + message]
  P --> V{Args valid?}
  V -->|no| R[Ask user / retry]
  V -->|yes| Call[tools/call]
  Call --> Out[Read tool text]
  Out --> Reply[Answer in English]
  C -->|no| Chat[Normal chat, no tools]
```

| You say | Typical tool call |
| --- | --- |
| Create a todo called Prepare MCP Masterclass with high priority | `create_todo({ title: "Prepare MCP Masterclass", priority: "high" })` |
| Show my incomplete todos | `list_todos({ completed: false })` |
| What is todo `f660cf06-…`? | `get_todo({ id: "f660cf06-…" })` |
| Rename it to Finish slides | `update_todo({ id, title: "Finish slides" })` |
| Mark the MCP slides as complete | `complete_todo({ id })` — Claude often `list_todos` first to get the id |
| Delete the test demo todo | `delete_todo({ id })` |

If Claude needs an id it does not have, it calls `list_todos` first. That is expected.

Enable the connector **in the chat** (`+` → Connectors). A connector that is only saved in settings but disabled for the conversation will not be used.

---

## 6. Wire format (JSON-RPC)

MCP messages are JSON-RPC 2.0 over HTTP. You rarely write these by hand; the SDK and Claude do. Showing them is useful in class.

### `tools/list` (discovery)

Request shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

Response includes the six tools and their schemas.

### `tools/call` (action)

Request shape:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "create_todo",
    "arguments": {
      "title": "Prepare MCP Masterclass",
      "priority": "high"
    }
  }
}
```

Successful result shape (simplified):

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Todo created successfully.\n\nID: …\nTitle: Prepare MCP Masterclass\nPriority: high"
      }
    ]
  }
}
```

On handler failure, tools return `isError: true` plus a text message (see `toolError` in `src/types/todo.ts`). That is still an MCP result, not an HTTP 500 — the protocol delivered the error to Claude.

```mermaid
sequenceDiagram
  participant C as Claude
  participant S as /mcp
  C->>S: tools/list
  S-->>C: six tool definitions
  C->>S: tools/call create_todo
  S-->>C: content text + optional isError
```

---

## 7. Request lifecycle

### Full path for `create_todo`

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Claude as Claude
  participant HTTP as Express /mcp
  participant SDK as createMcpHandler
  participant Tool as create_todo
  participant DB as supabase.ts
  participant PG as Postgres
  participant Desk as Desk /api/todos

  User->>Claude: Create todo Prepare MCP Masterclass, high priority
  Claude->>Claude: Pick create_todo + args
  Claude->>HTTP: POST /mcp tools/call
  HTTP->>SDK: toNodeHandler(req, res, body)
  SDK->>Tool: Zod-validated args
  Tool->>DB: createTodo({ title, priority })
  DB->>PG: INSERT INTO todos RETURNING *
  PG-->>DB: row
  DB-->>Tool: Todo
  Tool-->>SDK: content text
  SDK-->>Claude: MCP result
  Claude-->>User: Created your high-priority todo…

  Note over Desk,PG: Desk never talks to Claude
  Desk->>HTTP: GET /api/todos
  HTTP->>DB: listTodos()
  DB->>PG: SELECT * FROM todos
  PG-->>Desk: JSON todos array
```

### Inside one Node request

```mermaid
flowchart TD
  A["POST /mcp"] --> B["app.all in index.ts"]
  B --> C["toNodeHandler"]
  C --> D["createMcpHandler factory"]
  D --> E["createTodoMcpServer()"]
  E --> F["McpServer with 6 registerTool calls"]
  F --> G{"method / tool name"}
  G -->|create_todo| H["src/tools/createTodo.ts"]
  G -->|list_todos| I["src/tools/listTodos.ts"]
  G -->|get_todo| J["src/tools/getTodo.ts"]
  G -->|update_todo| K["src/tools/updateTodo.ts"]
  G -->|complete_todo| L["src/tools/completeTodo.ts"]
  G -->|delete_todo| M["src/tools/deleteTodo.ts"]
  H --> N["src/db/supabase.ts"]
  I --> N
  J --> N
  K --> N
  L --> N
  M --> N
  N --> O[("todos")]
  H --> P["MCP content[]"]
  P --> Q["Claude"]
```

`createMcpHandler(() => createTodoMcpServer())` builds a **fresh** `McpServer` per HTTP request (stateless). Database state lives in Postgres, not in process memory. That is why Render can sleep, wake, and still see the same todos.

---

## 8. Code map

```text
todo-mcp/
├── src/
│   ├── index.ts              Express: /mcp, /api/todos, /, /health
│   ├── server.ts             new McpServer + register all tools
│   ├── tools/                one file per tool
│   │   ├── createTodo.ts
│   │   ├── listTodos.ts
│   │   ├── getTodo.ts
│   │   ├── updateTodo.ts
│   │   ├── completeTodo.ts
│   │   └── deleteTodo.ts
│   ├── db/supabase.ts        all SQL
│   ├── types/todo.ts         types + formatters + toolError
│   └── scripts/setupDb.ts    CREATE TABLE IF NOT EXISTS
├── public/                   Desk UI (not MCP)
│   ├── index.html
│   ├── styles.css
│   └── app.js                poll /api/todos every 2s
├── render.yaml
├── .env.example
└── .env                      gitignored
```

```mermaid
flowchart TB
  subgraph index["src/index.ts"]
    A1["createMcpExpressApp({ host })"]
    A2["createMcpHandler(() => createTodoMcpServer())"]
    A3["app.all('/mcp')"]
    A4["app.get('/api/todos')"]
    A5["express.static('public')"]
  end

  subgraph server["src/server.ts"]
    B1["new McpServer({ name, version })"]
    B2["registerCreateTodo … registerDeleteTodo"]
  end

  subgraph tools["src/tools/*"]
    C1["registerTool(name, { inputSchema }, handler)"]
  end

  subgraph db["src/db/supabase.ts"]
    D1["postgres(DATABASE_URL)"]
    D2["createTodo / listTodos / getTodo / updateTodo / completeTodo / deleteTodo"]
  end

  A2 --> B1
  A3 --> A2
  B1 --> B2 --> C1 --> D2
  A4 --> D2
  D2 --> D1
```

### Anatomy of `registerTool`

Every tool is the same three pieces:

1. **Name** — `create_todo` (what Claude calls)
2. **Config** — `title`, `description`, `inputSchema` (Zod)
3. **Handler** — `async (args) => ({ content: [{ type: "text", text }] })`

The handler must not throw through to Express for expected failures. Catch DB errors and return `toolError(...)`.

---

## 9. Database layer

All SQL lives in `src/db/supabase.ts` so tools stay thin.

```mermaid
erDiagram
  TODOS {
    uuid id PK
    text title
    text description
    boolean completed
    text priority
    date due_date
    timestamptz created_at
    timestamptz updated_at
  }
```

| Column | Notes |
| --- | --- |
| `id` | `gen_random_uuid()` |
| `title` | required |
| `description` | nullable |
| `completed` | default `false` |
| `priority` | default `medium` (app also uses `low` / `high`) |
| `due_date` | optional date |
| `created_at` / `updated_at` | timestamps; updates set `updated_at` in app code |

Connection options: `ssl: require`, `connect_timeout: 8` (fail instead of hanging on IPv6), small pool (`max: 4`).

On Render, if `DATABASE_URL` still points at `db.*.supabase.co`, the process logs that Render cannot reach IPv6-only direct hosts.

---

## 10. Desk UI

Desk is a static page. It is **not** an MCP client.

| File | Role |
| --- | --- |
| `public/index.html` | Layout: Open / Done counts, filters, list |
| `public/styles.css` | Visual design |
| `public/app.js` | `fetch("/api/todos")` every 2 seconds |

Filters `open` / `done` / `all` are client-side. The API always returns the full list.

If `/api/todos` returns non-JSON (HTML error page, empty body), `app.js` shows a slice of the raw text instead of `JSON.parse` crashing.

```mermaid
sequenceDiagram
  participant Page as Desk
  participant API as GET /api/todos
  participant DB as Postgres
  loop every 2 seconds
    Page->>API: fetch cache no-store
    API->>DB: SELECT *
    DB-->>Page: JSON
    Page->>Page: re-render if fingerprint changed
  end
```

---

## 11. Two clients, one database

```mermaid
flowchart TB
  Claude["Claude — MCP write/read"] --> Server["todo-mcp"]
  Desk["Desk — HTTP read"] --> Server
  Server --> PG[("todos")]
  Claude -.->|no protocol between them| Desk
```

Claude writes via tools. Desk only reads `/api/todos`. They never message each other. The shared table is the proof for the audience.

---

## 12. Security model

```mermaid
flowchart TB
  Claude -->|tool args + result text only| MCP
  Browser -->|HTML + JSON list only| MCP
  MCP -->|DATABASE_URL only here| PG[("Supabase")]
  GitHub -.->|must not contain| Secret[".env"]
  Claude -.->|must not receive| Secret
  Browser -.->|must not receive| Secret
```

Classroom rules:

- Never commit `.env`
- Never put the password in README or client JS
- On Render, use **Session pooler** (`postgres.PROJECT_REF@aws-0-REGION.pooler.supabase.com:5432`)
- URL-encode the password (`&` → `%26`, `@` → `%40`)
- Direct `db.PROJECT.supabase.co` is often **IPv6-only**; Render is IPv4-only → `ENETUNREACH`
- This URL is public. Anyone with it can call the tools. Add bearer auth / OAuth before real data
- No `ANTHROPIC_API_KEY` on this server — Claude is the client, not an API this app calls

---

## 13. Tools reference

| Tool | Inputs | DB | Result text |
| --- | --- | --- | --- |
| `create_todo` | `title` required; `description`, `priority`, `due_date` optional | `INSERT` | “Todo created successfully.” + id, title, priority |
| `list_todos` | optional `completed`, `priority` | `SELECT` + filters | Numbered list, or “No todos found.” |
| `get_todo` | `id` (UUID) | `SELECT` one | Full field dump |
| `update_todo` | `id` + any of title, description, priority, due_date, completed | `UPDATE` | “Todo updated successfully.” + dump |
| `complete_todo` | `id` | `UPDATE completed = true` | “Todo completed successfully.” |
| `delete_todo` | `id` | `DELETE` | “Todo deleted successfully.” |

Missing rows throw `Todo not found: <id>` and return via `toolError`.

---

## 14. How to add another tool

Example: `count_todos`.

1. Add `countTodos()` in `src/db/supabase.ts` (`SELECT count(*)`)
2. Create `src/tools/countTodos.ts` with `registerTool("count_todos", { inputSchema: z.object({}) }, handler)`
3. Call `registerCountTodos(server)` from `src/server.ts`

No change to `/mcp` routing. Claude picks up the new tool on the next `tools/list`.

```mermaid
flowchart LR
  A[db function] --> B[tools/countTodos.ts]
  B --> C[server.ts register]
  C --> D[Claude tools/list]
```

---

## 15. Setup, deploy, connect Claude

### Credentials

Required:

```text
DATABASE_URL
```

Not required: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, Claude secrets on the server.

If `DATABASE_URL` is missing, the process exits:

```text
Missing required environment variable:
DATABASE_URL
```

`.env.example`:

```text
DATABASE_URL=postgresql://postgres.your_project_ref:your_password@aws-0-your-region.pooler.supabase.com:5432/postgres
PORT=3001
```

### Create the table

```bash
npm run setup:db
```

### Local

```bash
cp .env.example .env
# set DATABASE_URL
npm install
npm run setup:db
npm run dev
```

Local default port is **3001** (3000 is often taken).

| Endpoint | URL |
| --- | --- |
| Desk | http://localhost:3001/ |
| API | http://localhost:3001/api/todos |
| Health | http://localhost:3001/health |
| MCP | http://localhost:3001/mcp |

Inspector (no Claude):

```bash
npx @modelcontextprotocol/inspector
```

Streamable HTTP → `http://localhost:3001/mcp`

### Render

`render.yaml` already defines a free Node web service.

1. GitHub repo connected to Render
2. Build: `npm ci --include=dev && npm run build`
3. Start: `npm start` (`node dist/index.js`)
4. Env: `DATABASE_URL` = session pooler URI, password URL-encoded
5. Health: `/health`
6. `NODE_ENV=production` (binds `0.0.0.0`)

Free instances sleep. First hit after idle can take 30–60s. Open Desk first, then talk to Claude.

### Connect Claude

1. Wake Desk in a browser
2. Claude → **Customize → Connectors → + → Add custom connector**
3. URL:

```text
https://todo-mcp-k1gg.onrender.com/mcp
```

4. No OAuth
5. In the chat: **+ → Connectors** → enable the connector

Free Claude: **one** custom connector.

```mermaid
sequenceDiagram
  actor You
  participant UI as Claude Connectors
  participant Cloud as Anthropic
  participant App as Render /mcp

  You->>UI: Add https://…/mcp
  UI->>Cloud: Store connector
  You->>UI: Enable in this chat
  You->>UI: Create three todos…
  Cloud->>App: tools/list + tools/call
  App-->>Cloud: tool results
  Cloud-->>You: English reply
```

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Claude cannot connect | Server asleep, or URL missing `/mcp` | Open Desk, wait, use `…/mcp` |
| Desk skeleton forever | `/api/todos` failing | Check Render logs |
| `ENETUNREACH` IPv6 address `:5432` | Direct `db.*.supabase.co` URL | Session pooler URI |
| `password authentication failed` | Literal `[YOUR-PASSWORD]` or unencoded `&` `@` | Encode password; paste full URI |
| `JSON.parse` in the browser | HTML error page instead of JSON | Older bug; current `app.js` shows raw text |
| `EADDRINUSE 3001` / `3000` | Another app on that port | Change `PORT` in `.env` |
| Connector saved but unused | Disabled in this chat | Enable under `+` → Connectors |
| Tools exist but writes vanish | Looking at wrong Supabase project | Same `DATABASE_URL` as Render |

---

## 17. Live demo script

Keep Desk beside Claude.

1. **Create**

   > Create three todos: finish the MCP slides, test the demo, and prepare questions for the audience.

2. **List**

   > Show me all my incomplete todos.

3. **Complete**

   > Mark the MCP slides as complete.

4. **Prove it**

   Desk should update within about two seconds. Optionally open the `todos` table in Supabase.

```mermaid
flowchart LR
  A[Ask Claude] --> B[Tool call on /mcp]
  B --> C[INSERT / UPDATE in Postgres]
  C --> D[Desk polls /api/todos]
  D --> E[Audience sees the row]
```

Claude is not inventing a todo list. It is driving this server and this database through MCP.
