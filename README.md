# Todo MCP Server

Remote MCP Todo server: **Claude → Streamable HTTP MCP → Node.js → Supabase PostgreSQL**.

No API keys for Claude or OpenAI live in this project. The only secrets are Supabase credentials, injected through environment variables.

```text
        CLAUDE                         BROWSER
          │                               │
          │ MCP                           │ GET /
          ▼                               ▼
 ┌─────────────────────────────────────────────┐
 │              Remote MCP Server              │
 │         /mcp  ·  /  ·  /api/todos           │
 └──────────────────────┬──────────────────────┘
                        │ DATABASE_URL (server only)
                        ▼
                   Supabase todos
```

## Tools

| Tool | Purpose |
| --- | --- |
| `create_todo` | Create a todo (`title`, optional `description`, `priority`, `due_date`) |
| `list_todos` | List todos (optional `completed`, `priority` filters) |
| `get_todo` | Fetch one todo by id |
| `update_todo` | Update fields on an existing todo |
| `complete_todo` | Mark a todo completed |
| `delete_todo` | Delete a todo |

## Credentials

This server **fails immediately** if required variables are missing:

```text
Missing required environment variable:
DATABASE_URL
```

You need:

```text
[ ] Supabase Postgres connection string (DATABASE_URL)
```

For deployment:

```text
[ ] Railway account
```

For Claude:

```text
[ ] Claude account with custom connector access
```

You do **not** need:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- any Claude credentials on the MCP server

Copy `.env.example` to `.env` and fill in values locally. Never commit `.env`. Never put `DATABASE_URL` in GitHub, the README, or client-side code. The database password belongs only on this server.

## 1. Create the Supabase table

```bash
npm run setup:db
```

That creates:

```sql
CREATE TABLE IF NOT EXISTS todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT FALSE,
    priority TEXT DEFAULT 'medium',
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

You do not need Supabase Auth for this classroom version.

## 2. Run locally

```bash
cd todo-mcp
cp .env.example .env
# edit .env with DATABASE_URL
npm install
npm run setup:db
npm run test:db
npm run dev
```

Endpoints:

- Board: `http://localhost:3001/` (live view of the `todos` table)
- API: `http://localhost:3001/api/todos`
- Health: `http://localhost:3001/health`
- MCP: `http://localhost:3001/mcp`

The board polls `/api/todos` every 2 seconds. The browser never receives `DATABASE_URL`.

`npm run test:db` proves create → list → get → update → complete → delete against Supabase **before** you involve Claude.

Then inspect the MCP tools:

```bash
npx @modelcontextprotocol/inspector
```

Use Streamable HTTP and URL `http://localhost:3001/mcp`.

## 3. Deploy (Render or Railway)

This is a normal Node web service: `npm run build` then `npm start`. Render injects `PORT`; you only add `DATABASE_URL`.

### Render

1. Push `todo-mcp` to GitHub.
2. New **Web Service** from that repo. If the GitHub repo is the parent `MCP` folder, set **Root Directory** to `todo-mcp`.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Environment variable: `DATABASE_URL`
6. Health check path: `/health`

Claude connector URL:

```text
https://your-service.onrender.com/mcp
```

Board:

```text
https://your-service.onrender.com/
```

If the service boots but cannot reach Postgres, replace `DATABASE_URL` with the **pooler** URI from Supabase → Database → Connection string (Render is IPv4; the direct `db.*.supabase.co` host is often IPv6-only).

Free Render web services sleep after idle time. The first Claude call after a nap can take 30–60 seconds.

### Railway

Same env var (`DATABASE_URL`). Railway injects `PORT`. Public domain under Settings → Networking.

`GET /health` should return:

```json
{
  "status": "ok",
  "service": "todo-mcp"
}
```

## 4. Connect Claude

Claude → **Settings → Connectors → Add custom connector**.

MCP URL:

```text
https://your-service.onrender.com/mcp
```

No OAuth in this first classroom version.

## 5. Live demo

Ask Claude:

> Create three todos: finish the MCP slides, test the demo, and prepare questions for the audience.

Then:

> Show me all my incomplete todos.

Then:

> Mark the MCP slides as complete.

Keep the deployed site (`https://your-service.onrender.com/`) open beside Claude. New rows should appear on Desk within about two seconds. You can still open the `todos` table in Supabase if you want the raw proof.

## Security

```text
Claude
  │
  │ MCP
  ▼
MCP Server          ← DATABASE_URL lives only here
  │
  │ postgres
  ▼
Supabase
```

Never:

- Claude → Supabase directly
- Frontend → database password
- GitHub → `.env`

This classroom server is reachable by anyone who has the public URL. Add a bearer token or OAuth before using it with real data.
