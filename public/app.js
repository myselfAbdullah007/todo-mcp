const listEl = document.getElementById("list");
const skeletonEl = document.getElementById("skeleton");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");
const syncedEl = document.getElementById("synced");
const openCountEl = document.getElementById("open-count");
const doneCountEl = document.getElementById("done-count");
const liveDotEl = document.getElementById("live-dot");

let filter = "open";
let todos = [];
let fingerprint = "";

for (const button of document.querySelectorAll(".pill")) {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelector(".pill.is-active")?.classList.remove("is-active");
    button.classList.add("is-active");
    render();
  });
}

function visibleTodos() {
  if (filter === "open") return todos.filter((todo) => !todo.completed);
  if (filter === "done") return todos.filter((todo) => todo.completed);
  return todos;
}

function shortId(id) {
  return id.slice(0, 8);
}

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function render() {
  const items = visibleTodos();
  const open = todos.filter((todo) => !todo.completed).length;
  const done = todos.length - open;

  openCountEl.textContent = String(open);
  doneCountEl.textContent = String(done);
  skeletonEl.hidden = true;
  statusEl.hidden = true;
  listEl.hidden = false;

  if (items.length === 0) {
    listEl.innerHTML = `<p class="empty">${
      todos.length === 0
        ? "Nothing in the table yet. Ask Claude to create a todo, then watch this page."
        : "No todos in this filter."
    }</p>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (todo, index) => `
        <article class="shell" style="--i: ${index}">
          <div class="row ${todo.completed ? "is-done" : ""}">
            <h2 class="title">${escapeHtml(todo.title)}</h2>
            <span class="priority ${escapeHtml(todo.priority)}">${escapeHtml(todo.priority)}</span>
            <div class="meta">
              ${todo.description ? `<span>${escapeHtml(todo.description)}</span>` : ""}
              ${todo.due_date ? `<span>due ${escapeHtml(todo.due_date)}</span>` : ""}
              <span class="id">${shortId(todo.id)}</span>
              <span>${formatWhen(todo.updated_at)}</span>
            </div>
          </div>
        </article>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showError(message) {
  skeletonEl.hidden = true;
  listEl.hidden = true;
  statusEl.hidden = false;
  statusEl.classList.add("is-error");
  statusEl.textContent = message;
}

async function refresh() {
  const response = await fetch("/api/todos", { cache: "no-store" });
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(raw.slice(0, 280) || "Could not load todos");
  }
  if (!response.ok) {
    throw new Error(body.error ?? "Could not load todos");
  }

  const next = body.todos ?? [];
  const nextFingerprint = JSON.stringify(
    next.map((todo) => [todo.id, todo.updated_at, todo.completed])
  );

  todos = next;
  syncedEl.textContent = `synced ${formatWhen(new Date().toISOString())}`;

  const changed = fingerprint !== nextFingerprint;
  if (changed) {
    render();
  }
  if (fingerprint && changed) {
    liveDotEl.classList.add("is-fresh");
    hintEl.textContent = "Database changed";
    window.setTimeout(() => {
      liveDotEl.classList.remove("is-fresh");
      hintEl.textContent = "Polling every 2 seconds";
    }, 900);
  }

  fingerprint = nextFingerprint;
}

async function tick() {
  try {
    await refresh();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not load todos");
  }
}

tick();
window.setInterval(tick, 2000);
