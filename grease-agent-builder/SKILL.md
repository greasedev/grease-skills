---
name: grease-agent-builder
description: Build Grease Agent projects with workflow-sdk. 1) Understand agent structure 2) Write agent MD files 3) Use workflow-sdk APIs 4) Write workflows 5) Write Pages 6) Test and deploy.
user-invocable: true
---

# Grease Agent Builder

Build agent projects using `@greaseclaw/workflow-sdk`. An agent consists of metadata files, API dependencies, and a `workflows/` directory containing TypeScript code for workflows, pages, and shared utilities.

## Part 1: Agent Code Structure

Each agent is a directory containing:

```
agent.json                 # Agent config: name, identity, apiDependencies, version
files/
  IDENTITY.md              # Agent persona: name, creature, vibe, capabilities
  SOUL.md                  # Behavioral guidelines: core truths, boundaries, vibe
  AGENTS.md                # Workspace instructions: session startup, memory, safety
  TOOLS.md                 # Local conventions and tool notes
  USER.md                  # User profile: name, timezone, context notes
  apis/                    # GreaseApi JSON files (from grease-api-builder)
    x.com/
      twitter-search.json
      twitter-list-tweets.json
      ...
  workflows/
    package.json           # Dependencies (must include @greaseclaw/workflow-sdk)
    tsconfig.json          # TypeScript config
    src/                   # Source code (structure is up to you)
    dist/                  # Built output — this is what the runtime loads
      pages/
        simple.html        # Page HTML files
        tweets.html
      workflows/           # Workflow JS bundles
        sync_list_tweets.js
        read_saved_tweets.js
```

The `src/` directory structure is flexible — organize it however you like. The only hard requirement is that `dist/` must contain:
- `dist/pages/` — HTML files for each page
- `dist/workflows/` — JS bundles for each workflow

One example `src/` layout:

```
src/
  api.ts               # Auto-generated API client (agent.call() wrappers)
  default_workflow.ts  # Default workflow handler
  pages/
    simple.ts / simple.html
    tweets.ts / tweets.html
  shared/
    types.ts / utils.ts / db.ts / portfolio.ts / sync.ts / index.ts
  workflows/
    sync_list_tweets_workflow.ts
    read_saved_tweets_workflow.ts
```

### agent.json

```json
{
  "formatVersion": 2,
  "agent": {
    "name": "社媒聚焦助手",
    "identity": { "emoji": "👀" },
    "isDefault": false,
    "description": "Agent description...",
    "apiDependencies": ["x.com", "weibo.com"],
    "isActive": true,
    "version": 8
  },
  "files": [
    { "name": "apis/x.com/twitter-search.json", "enabled": true, "owner": "user" },
    { "name": "IDENTITY.md", "enabled": true, "owner": "user", "predefined": true },
    { "name": "workflows/dist/pages/simple.html", "enabled": true, "owner": "user" },
    ...
  ]
}
```

Key fields:
- `apiDependencies`: List of API platforms the agent uses. Determines which API methods are available in `api.ts`.
- `files`: All files in the agent. Predefined files (`IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `TOOLS.md`, `USER.md`) are always enabled.

### Metadata Files

| File | Purpose | Notes |
|------|---------|-------|
| `IDENTITY.md` | Agent persona: name, creature, vibe, emoji | Who the agent IS |
| `SOUL.md` | Behavioral principles: core truths, boundaries | How the agent THINKS |
| `AGENTS.md` | Workspace instructions: session startup, memory rules | How the agent WORKS |
| `TOOLS.md` | Local conventions, output preferences, API notes | Agent's cheat sheet |
| `USER.md` | User profile: name, timezone, projects, preferences | Who the agent SERVES |

Each session, the agent reads `SOUL.md` first, then `USER.md`, then checks `MEMORY.md`.

### workflows/package.json

```json
{
  "name": "workflows",
  "type": "module",
  "dependencies": {
    "@greaseclaw/workflow-sdk": "github:greasedev/workflow-sdk#main"
  },
  "devDependencies": {
    "@types/node": "^25.5.2",
    "esbuild": "^0.25.12",
    "tsx": "^4.21.0"
  },
  "scripts": {
    "build": "npx tsx node_modules/@greaseclaw/workflow-sdk/bin/workflow-build.mjs src dist",
    "dev": "npx tsx node_modules/@greaseclaw/workflow-sdk/bin/workflow-dev.mjs",
    "zip": "npm run build && rm -f workflows.zip && zip -r workflows.zip src dist package.json tsconfig.json"
  }
}
```

Use `pnpm install` to install dependencies.

## Part 2: Agent Markdown Files

The five markdown files define the agent's personality, behavior, and context. They are read at the start of every session.

### IDENTITY.md — Who the Agent IS

Defines the agent's persona, capabilities, and character.

**Structure:**
```markdown
# IDENTITY.md - Who Am I?

- **Name:** <agent name>
- **Creature:** <one-line description of what the agent is>
- **Vibe:** <personality traits, separated by dashes>
- **Emoji:** <single emoji>

---

<2-3 sentences: what the agent is and does>

My core capabilities:

- **<Capability 1>** — <one-line explanation>
- **<Capability 2>** — <one-line explanation>
- **<Capability 3>** — <one-line explanation>

---

*<One-line tagline summarizing the agent's value>*
```

**Guidelines:**
- Keep it concise — this is identity, not documentation
- `Creature` should be evocative, not generic (e.g. "Digital investigator living in the data streams", not "AI assistant")
- `Vibe` uses 3-4 adjective traits, ending with a behavioral anchor (e.g. "Methodical, discerning, precise — never rushes to judgment")
- Core capabilities: 3-5 items, each with a bold name and one-line explanation
- The tagline at the end should be memorable and concise

### SOUL.md — How the Agent THINKS

Defines behavioral principles, boundaries, and decision-making rules.

**Structure:**
```markdown
# SOUL.md - Who You Are

## Core Truths

**<Truth 1>.** <Explanation and implication>

**<Truth 2>.** <Explanation and implication>

## Boundaries

- <Hard rule 1>
- <Hard rule 2>
- <Hard rule 3>

## Vibe

<One paragraph: the agent's conversational personality>

## Continuity

<How the agent handles memory across sessions>
```

**Guidelines:**
- Core Truths are **bold statements** followed by explanation — they are non-negotiable rules
- Boundaries are hard lines the agent will not cross (safety, ethics, accuracy)
- Vibe describes conversational style, not capabilities — it's about *how* the agent communicates
- Continuity explains the agent's relationship with memory/files across sessions
- Keep it under 30 lines — this is injected into every prompt

### AGENTS.md — How the Agent WORKS

Workspace instructions: session startup sequence, memory management, and safety rules.

**Key sections:**
```markdown
# AGENTS.md - Your Workspace

## Every Session

Before doing anything else:

1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Check `MEMORY.md` for user-curated long-term context
4. Check agent memory files (`memory/*.md`) for your own saved notes

## Memory

- **MEMORY.md** — curated long-term memory (injected into every prompt, keep concise)
- **memory/*.md** — daily/topic notes (raw logs, not injected)
- "remember this" → save to `memory/*.md` or update `MEMORY.md` if important

## Safety

- Don't exfiltrate private data
- Don't take destructive actions without asking
- When in doubt, ask
```

**Guidelines:**
- The "Every Session" startup sequence is critical — it ensures the agent loads context before acting
- Memory section explains the two-tier system: `MEMORY.md` (curated, injected) vs `memory/*.md` (raw, on-demand)
- Safety rules should be explicit and short
- This file is the most "structural" — it defines workflow, not personality

### TOOLS.md — Agent's Cheat Sheet

Local conventions, output preferences, and environment-specific notes.

**Structure:**
```markdown
# TOOLS.md - Local Notes

## Preferences
- Always use TypeScript over JavaScript
- Prefer concise bullet-point answers over long prose
- Use metric units

## Conventions
- Code examples should include error handling
- Use ISO 8601 for dates
```

**Guidelines:**
- This is the most flexible file — put whatever helps the agent do its job
- Preferences section: output format, language, units, style
- Conventions section: coding standards, naming, documentation rules
- Keep it short — this is a reference, not a manual

### USER.md — Who the Agent SERVES

User profile and context. The agent learns about the user over time.

**Structure:**
```markdown
# USER.md - About Your Human

- **Name:**
- **What to call them:**
- **Pronouns:** _(optional)_
- **Timezone:**
- **Notes:**

## Context

_(What do they care about? What projects are they working on? Build this over time.)_
```

**Guidelines:**
- Start minimal — fill in details as you learn them across sessions
- `Context` section is the most valuable — it helps the agent tailor responses
- Respect privacy — this is about helping, not profiling
- The agent can update this file as it learns, but should be transparent about changes

### Writing Tips

1. **Keep all files short** — they are injected into prompts, so every line costs tokens
2. **IDENTITY.md and SOUL.md are the personality layer** — they shape how the agent talks and decides
3. **AGENTS.md and TOOLS.md are the operational layer** — they shape how the agent works
4. **USER.md is the personalization layer** — it shapes who the agent serves
5. **Use bold for key terms** — the agent weights bold text more heavily
6. **Be specific, not generic** — "never presents unverified claims as fact" beats "be accurate"
7. **Test by reading the files as a whole** — after writing all five, read them in sequence (IDENTITY → SOUL → AGENTS → TOOLS → USER) and check if the persona is coherent

## Part 3: workflow-sdk Usage

### Agent Class

The `Agent` class is the core SDK object:

```typescript
import { Agent } from '@greaseclaw/workflow-sdk';

const agent = new Agent(context.agentOptions || {});
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `agentId` | `string` (readonly) | Unique identifier for the agent instance |
| `signal` | `AbortSignal \| undefined` (readonly) | Abort signal for cancellation |
| `browserContext` | `BrowserContext \| undefined` (readonly) | Current browser context (tabs, windows) |
| `stateful` | `boolean` (readonly) | Whether the agent is stateful |
| `scheduler` | `Scheduler` (readonly) | Scheduler instance for cron/delayed tasks |
| `sessionId` | `string \| null` | Current session ID (get/set) |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `agent.call<T>(endpoint, options?)` | `Promise<CallResult<T>>` | Low-level API call. Prefer using `createWorkflowApis(agent)` instead |
| `agent.getDb()` | `Dexie` | Get Dexie database instance (name: `db-{agentId}`) |
| `agent.getPageLink(pageId, params?)` | `string` | Generate `<pageLink>` XML tag for page navigation |
| `agent.complete(prompt, options?)` | `Promise<CompleteResult>` | LLM completion with optional system prompt |
| `agent.sendText(chatId, title, content)` | `Promise<SendTextResult>` | Send a text message to the chat |
| `agent.sendImage(chatId, base64Image)` | `Promise<SendImageResult>` | Send an image to the chat |
| `agent.dispose()` | `Promise<void>` | Clean up agent resources |
| `agent.throwIfAborted()` | `void` | Throw if the agent has been aborted |

> **Note:** Avoid calling `agent.call()` directly. Use the auto-generated API client instead:
> ```typescript
> // Don't
> const { data } = await agent.call('/v1/custom/twitter-list-tweets', { method: 'POST', body: { list_id: id } });
>
> // Do
> const apis = createWorkflowApis(agent);
> const result = await apis.twitter_list_tweets(id, limit);
> ```

### BrowserContext

```typescript
interface BrowserContext {
  windowId?: number;
  activeTab?: Tab;
  selectedTabs?: Tab[];
  tabs?: Tab[];
  enabledMcpServers?: string[];
}

interface Tab {
  id: number;
  url?: string;
  title?: string;
  pageId?: number;
}
```

### Scheduler

The `agent.scheduler` manages scheduled jobs (cron, one-shot, recurring):

```typescript
// List all scheduled tasks
const { tasks } = await agent.scheduler.list();

// Add a cron job
await agent.scheduler.add({
  name: 'sync-tweets',
  schedule: { kind: 'cron', expr: '0 */4 * * *' },
  payload: { kind: 'invokeWorkflow', workflowName: 'sync_list_tweets' },
});

// Run a task immediately
await agent.scheduler.run(taskId);
```

| Method | Description |
|--------|-------------|
| `scheduler.status()` | Get scheduler running status |
| `scheduler.list(includeDisabled?)` | List all scheduled tasks |
| `scheduler.add(job)` | Add a new scheduled job |
| `scheduler.update(taskId, patch)` | Update an existing job |
| `scheduler.remove(taskId)` | Remove a scheduled job |
| `scheduler.run(taskId)` | Trigger a job immediately |
| `scheduler.runs(taskId)` | Get execution history for a job |

### Error Classes

```typescript
// All extend WorkflowSDKError (code + statusCode)
ConnectionError    // Network/connectivity issues
ActionError        // Workflow action failures
CompletionError    // LLM completion failures
CallError          // agent.call() failures
SendTextError      // agent.sendText() failures
SendImageError     // agent.sendImage() failures
SchedulerError     // Scheduler operation failures
```

### WorkflowContext

Every workflow receives a `WorkflowContext`:

```typescript
import { type WorkflowContext } from '@greaseclaw/workflow-sdk';

interface WorkflowContext {
  agentOptions?: AgentOptions;  // Options for creating the agent instance
  task: string;                 // Task description for the workflow to accomplish
  chatId?: string;              // Chat ID for the current conversation
  params?: Record<string, unknown>;  // Key-value pairs for workflow parameters
}
```

### API Client (Auto-Generated)

`api.ts` is auto-generated from `apiDependencies`. It provides typed wrapper functions:

```typescript
import { createWorkflowApis, type ExecutionResult } from '../api';

const apis = createWorkflowApis(agent);

// Each API call returns ExecutionResult
type ExecutionResult = {
  success: boolean;
  error?: string;
  task?: {
    id: string;
    status: 'waiting' | 'running' | 'succeeded' | 'failed';
    extract_data?: string;
    metrics_tokens: number;
    metrics_time: number;
  };
};

// Example calls
const result = await apis.twitter_list_tweets(listId, 100);
const result = await apis.twitter_search(query, filter, limit);
const result = await apis.twitter_list_add(listId, username);
```

**Do not edit `api.ts` manually** - it is regenerated when API dependencies change.

### Database (Dexie)

The agent provides a Dexie (IndexedDB) database for persistent storage:

```typescript
const db = await agent.getDb();

// Define schema via db.version()
db.version(3).stores({
  interest_fields: '&id, topic, updatedAt',
  kols: '&id, interestId, handle, listKey, updatedAt',
  lists: '&id, interestId, listId, key, mode, updatedAt',
  tweets: '&id, interestId, *listIds, author, createdAt, savedAt, authorVerified, likes',
});

// Use Dexie table operations
const table = db.table('tweets');
await table.put(record);
await table.get(id);
await table.where('interestId').equals(value).toArray();
await table.orderBy('savedAt').reverse().limit(200).toArray();
```

Key: `&` = primary key, regular fields = indexed, `*` = multi-entry index.

### agent.complete and AI Prompts

Use `agent.complete()` to call the LLM with a structured prompt and optional JSON schema for parsing the response:

```typescript
// Basic completion
const result = await agent.complete('Analyze these tweets and summarize key themes');

// With system prompt and JSON schema for structured output
const portfolioSchema: JsonSchema = {
  type: 'object',
  required: ['sources'],
  properties: {
    sources: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        required: ['name', 'handle', 'type'],
        properties: {
          name: { type: 'string' },
          handle: { type: 'string' },
          type: { type: 'string', enum: ['Core', 'Diversity', 'Radar'] },
          reason: { type: 'string' },
        },
      },
    },
  },
};

const result = await agent.complete(
  `Based on the following tweets, suggest a portfolio of sources:\n${JSON.stringify(tweets)}`,
  { system: 'You are a media analyst.', schema: portfolioSchema },
);

// result.data contains the parsed JSON matching the schema
const sources: Source[] = result.data.sources;
```

**`agent.complete(prompt, options?)` parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | The user prompt / task description |
| `options.system` | `string?` | System prompt to set the AI persona |
| `options.schema` | `JsonSchema?` | JSON schema for structured response parsing |

**Return value (`CompleteResult`):**

| Field | Type | Description |
|-------|------|-------------|
| `data` | `T` | Parsed response matching the schema (or raw text if no schema) |
| `usage` | `{ input_tokens, output_tokens }` | Token usage stats |

## Part 4: Writing Workflows

A workflow is a TypeScript file with a YAML frontmatter header and an `execute()` function.

**Key point:** Each workflow is compiled into a single, self-contained JS bundle with all dependencies inlined. There are no `node_modules` or external imports at runtime — everything the workflow needs is in one JS file. This means:

- All imports (shared modules, utility functions, even `@greaseclaw/workflow-sdk`) are bundled into each workflow independently
- Node.js built-in modules (`fs`, `path`, etc.) are not available — workflows run in a sandboxed environment
- The only runtime entry point is `globalThis.execute`

### Workflow Frontmatter

```yaml
/**
 * ---
 * name: Sync List Tweets
 * description: "Read new tweets from user-created X.com lists"
 *
 * use when:
 * - Scheduled job needs to refresh tweets from prepared X.com lists
 * - User wants to sync tweets from one or more X.com lists
 *
 * cron:
 * - 0 */4 * * *
 *
 * input:
 * - name: interest
 *   description: Optional interest area used to filter saved lists
 *   required: false
 * - name: limit
 *   description: Number of tweets to read per list
 *   required: false
 *
 * output:
 * - success: bool
 * - message: string
 * - data: sync summary
 * ---
 */
```

Fields:
- `name`: Workflow display name
- `description`: What the workflow does
- `use when`: Trigger conditions
- `cron`: Scheduled execution (optional)
- `input`: Input parameters with name, description, required flag
- `output`: Return value structure

### Workflow Execute Function

```typescript
import { Agent, type WorkflowContext } from '@greaseclaw/workflow-sdk';
import { syncListTweets } from '../shared';

export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const params = context.params || {};
  const chatId = context.chatId;

  // Parse input parameters
  const result = await syncListTweets(agent, {
    interest: typeof params.interest === 'string' ? params.interest : undefined,
    listIds: Array.isArray(params.listIds) ? params.listIds.map(String) : undefined,
    limit: typeof params.limit === 'number' ? params.limit : undefined,
  });

  // Send chat message if chatId is available
  if (chatId) {
    const pageLink = agent.getPageLink('tweets', { interest: result.interest });
    await agent.sendText(chatId, 'Tweets 同步完成', `${result.message}\n\n查看：${pageLink}`);
  }

  // Return structured output
  return {
    success: result.success,
    message: result.message,
    data: { ...result, page: agent.getPageLink('tweets', { interest: result.interest }) },
  };
}

// @ts-ignore
globalThis.execute = execute;
```

**Important:** Always assign `globalThis.execute = execute` at the end. This is how the runtime finds and invokes the workflow.

### Workflow Patterns

**Read-only workflow** (query data, no API calls):
```typescript
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const data = await querySavedTweets(agent, options);
  return { success: true, data };
}
```

**Sync workflow** (call external APIs, save results):
```typescript
export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);

  // Rate limit API calls
  const response = await callWithLimit(() => apis.twitter_list_tweets(listId, limit));
  const tweets = extractSearchTweets(response);
  const added = await saveTweets(agent, interest, list, tweets);

  return { success: true, newTweets: added };
}
```

**Rate limiting pattern** (prevent API abuse):
```typescript
const apiIntervalMs = 15_000;
let nextApiAt = 0;

async function callWithLimit<T>(call: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const waitMs = Math.max(0, nextApiAt - now);
  nextApiAt = Math.max(now, nextApiAt) + apiIntervalMs;
  if (waitMs > 0) await sleep(waitMs);
  return call();
}
```

## Part 5: Writing Pages

Pages are interactive HTML views rendered inside the agent's chat UI. Each page consists of:
- An HTML template (`*.html`) — the page shell
- A TypeScript component (`*.ts`) — logic, DOM manipulation, API calls

**Key point:** Each page is compiled into a single, self-contained HTML file with CSS inlined in `<style>` and the TS component bundled into an inline `<script>`. There are no external file references in the output — everything the page needs is embedded in one HTML file. This means:

- Images and icons should use inline SVG or data URIs, not external files
- Fonts should use system font stacks, not `@import` or external URLs
- The `<script type="module" src="./page.ts">` in your source HTML is replaced by an inline bundle at build time — write it as a module import, the build handles the rest
- Shared modules (e.g. `../shared/utils`) are bundled into each page independently — changes to shared code will be included in every page that imports it

### HTML Template (Source)

Write the template with external references — the build will inline them:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Page Title</title>
    <link rel="stylesheet" href="./styles.css">
    <script type="module" src="./page-name.ts"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

Rules:
- `<div id="app">` is the render target — all dynamic content goes here
- `<script type="module">` loads the TS component as an ES module
- CSS is shared across pages via `styles.css`

### Page Component

Pages use vanilla TypeScript — no framework. The core pattern: **render HTML strings into `#app`, then bind events.**

```typescript
import { Agent } from '@greaseclaw/workflow-sdk';

const app = document.querySelector('#app') as HTMLElement;
const agent = new Agent((window as any).agentOptions || {});

// State
let items: Item[] = [];
let loading = false;

// Render loop: generate HTML → inject → bind events
function render() {
  app.innerHTML = `<main>${content()}</main>`;
  bindEvents();
}

function content(): string {
  if (loading) return '<p>Loading...</p>';
  return items.map(itemCard).join('');
}

function bindEvents() {
  document.querySelector('#refresh')?.addEventListener('click', refresh);
  document.querySelectorAll('[data-id]').forEach(el =>
    el.addEventListener('click', () => select(el.dataset.id!))
  );
}

// Initial render
render();
```

Key principles:
- **Single render function** — always go through `render()` to update the DOM
- **State drives the view** — change state variables, then call `render()`
- **Bind after render** — `innerHTML` destroys old listeners, so rebind every time
- **No framework needed** — template literals + `addEventListener` is sufficient

### Accessing Agent SDK in Pages

Pages can use the full Agent SDK from the browser:

```typescript
import { createWorkflowApis } from '../api';

const apis = createWorkflowApis(agent);

// Call any API
const result = await apis.twitter_list_tweets(listId, limit);

// Read/write database
const db = agent.getDb();
const tweets = await db.table('tweets').orderBy('savedAt').reverse().limit(200).toArray();

// Navigate to other pages
const link = agent.getPageLink('detail', { id: '123' });
```

### Rate Limiting

When calling external APIs from pages, always rate-limit to avoid abuse:

```typescript
const apiIntervalMs = 15_000;
let nextApiAt = 0;

async function callWithLimit<T>(call: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const waitMs = Math.max(0, nextApiAt - now);
  nextApiAt = Math.max(now, nextApiAt) + apiIntervalMs;
  if (waitMs > 0) await sleep(waitMs);
  return call();
}
```

### XSS Prevention

Always escape dynamic content in HTML templates:

```typescript
// In text content
`<h3>${escapeHtml(name)}</h3>`

// In attribute values
`<button data-id="${escapeAttr(id)}">`

// In URLs
`<a href="${escapeAttr(url)}" target="_blank">`
```

### Common Patterns

**Loading/progress state:**
```typescript
let loading = false;
let progress = { message: '', percent: 0 };

function startLoading(msg: string) {
  loading = true;
  progress = { message: msg, percent: 0 };
  render();
}

function updateProgress(msg: string, pct: number) {
  progress = { message: msg, percent: pct };
  render();
}

function stopLoading() {
  loading = false;
  render();
}
```

**Async action with UI feedback:**
```typescript
async function handleSync() {
  loading = true;
  render();
  try {
    const result = await callWithLimit(() => apis.twitter_list_tweets(listId, limit));
    items = extractData(result);
  } catch (err) {
    error = String(err);
  } finally {
    loading = false;
    render();
  }
}
```

**Preserving input focus across re-renders:**
```typescript
function render() {
  const wasFocused = document.activeElement?.id === 'search';
  const cursorPos = wasFocused ? (document.activeElement as HTMLInputElement).selectionStart : 0;

  app.innerHTML = `<main>...</main>`;

  if (wasFocused) {
    const input = document.querySelector('#search') as HTMLInputElement;
    input?.focus();
    input?.setSelectionRange(cursorPos, cursorPos);
  }
}
```

## Part 6: Testing and Build

### Testing Workflows

Use `workflow-dev.mjs` to run a workflow locally with mock context. Pass the workflow file path and a JSON string representing `WorkflowContext`:

```bash
npx tsx node_modules/@greaseclaw/workflow-sdk/bin/workflow-dev.mjs \
  <workflow-file> \
  '<json-context>'
```

The JSON context matches the `WorkflowContext` type — must include `task`, and can include `params` and `chatId`.

**Example scripts in `package.json`:**

```json
{
  "scripts": {
    "test:workflow:portfolio": "npx tsx node_modules/@greaseclaw/workflow-sdk/bin/workflow-dev.mjs src/workflows/generate_portfolio_workflow.ts '{\"task\":\"Generate portfolio\",\"params\":{\"interest\":\"AI Agent\"}}'",
    "test:workflow:lists": "npx tsx node_modules/@greaseclaw/workflow-sdk/bin/workflow-dev.mjs src/workflows/create_x_lists_workflow.ts '{\"task\":\"Create lists\",\"params\":{\"interest\":\"AI Agent\",\"portfolio\":{\"core\":[{\"name\":\"OpenAI\",\"handle\":\"@OpenAI\"}],\"diversity\":[{\"name\":\"Yann LeCun\",\"handle\":\"@ylecun\"}],\"radar\":[{\"name\":\"Hugging Face\",\"handle\":\"@huggingface\"}]}}}'",
    "test:workflow:tweets": "npx tsx node_modules/@greaseclaw/workflow-sdk/bin/workflow-dev.mjs src/workflows/sync_list_tweets_workflow.ts '{\"task\":\"Sync list tweets\",\"params\":{\"interest\":\"AI Agent\",\"limit\":30}}'"
  }
}
```

Then run with `pnpm run test:workflow:portfolio`, etc.

**Tips:**
- The workflow runs in a sandboxed environment with a mock agent instance
- `agent.getDb()` creates a local Dexie database for the test
- API calls (`apis.twitter_*`) require the browser agent runtime — they will fail in local test unless the agent is connected
- For pure logic workflows (no browser API calls), testing works fully locally
- Check console output for the workflow return value and any errors

### Testing Pages

Use `page-dev.mjs` to serve pages locally with hot reload:

```bash
npx tsx node_modules/@greaseclaw/workflow-sdk/bin/page-dev.mjs src/pages 3000
```

This starts a dev server at `http://localhost:3000` serving each page as a self-contained HTML file. Open `http://localhost:3000/simple.html` or `http://localhost:3000/tweets.html` in Mises Browser.

**Example script in `package.json`:**

```json
{
  "scripts": {
    "dev:pages": "npx tsx node_modules/@greaseclaw/workflow-sdk/bin/page-dev.mjs src/pages 3000"
  }
}
```

**Tips:**
- Pages are rebuilt on every file change (hot reload)
- `window.agentOptions` is available in the browser — the dev server provides a mock agent
- API calls from pages require the browser agent runtime to be connected
- Test layout and interactions first, then connect the agent runtime for API/DB testing

### Build

```bash
cd workflows
pnpm install
pnpm run build    # Builds src -> dist (JS + HTML pages)
```

The build script (`workflow-build.mjs`) bundles each workflow into `dist/workflows/*.js` and each page into `dist/pages/*.html` — all self-contained with inlined dependencies.

### Package for Upload

```bash
pnpm run zip      # Build + create workflows.zip
```

The zip includes: `src/`, `dist/`, `package.json`, `tsconfig.json`.

### File Registration

After building, register new files in `agent.json`:

```json
{
  "name": "workflows/dist/pages/simple.html",
  "enabled": true,
  "owner": "user",
  "predefined": false
}
```

Pages appear in `dist/pages/` after build. Workflow JS files appear in `dist/workflows/`.

### API Auto-Generation

When `apiDependencies` change, regenerate `api.ts`:
1. Update `apiDependencies` in `agent.json`
2. The system regenerates `workflows/src/api.ts` with typed methods for each API endpoint
3. **Never edit `api.ts` manually** - changes will be overwritten