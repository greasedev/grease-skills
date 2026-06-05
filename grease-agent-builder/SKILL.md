---
name: grease-agent-builder
description: Build Grease Agent projects with workflow-sdk. 1) Understand agent structure 2) Write workflows 3) Write Pages 4) Use API routes 5) Build and deploy.
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
    tsconfig.json          # TypeScript config (target ES2022, module ESNext)
    src/
      pages/
        simple.ts          # Page component (vanilla JS, no framework)
        simple.html        # Page HTML template
        tweets.ts
        tweets.html
      shared/
        types.ts           # Shared type definitions
        utils.ts           # Utility functions (extract, clean, format)
        db.ts              # Dexie database operations (save, query, sync)
        portfolio.ts       # Portfolio schema + AI prompts (JsonSchema)
        sync.ts            # Tweet/member sync logic
        index.ts           # Barrel export
      workflows/
        api.ts               # Auto-generated API client (agent.call() wrappers)
        default_workflow.ts  # Default workflow handler
        sync_list_tweets_workflow.ts
        read_saved_tweets_workflow.ts
    dist/                  # Built output (JS + HTML pages)
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

## Part 2: workflow-sdk Usage

### Agent Class

The `Agent` class is the core SDK object. Create it with agent options:

```typescript
import { Agent } from '@greaseclaw/workflow-sdk';

const agent = new Agent(context.agentOptions || {});
```

**Key methods:**

| Method | Description |
|--------|-------------|
| `agent.call<T>(endpoint, options)` | Call a GreaseApi endpoint. Returns `{ data: T }` |
| `agent.getDb()` | Get Dexie database instance for persistent storage |
| `agent.sendText(chatId, title, text)` | Send a text message to the chat |
| `agent.getPageLink(pageName, params)` | Generate a link to a registered page |

### WorkflowContext

Every workflow receives a `WorkflowContext`:

```typescript
import { type WorkflowContext } from '@greaseclaw/workflow-sdk';

interface WorkflowContext {
  agentOptions?: Record<string, unknown>;
  params?: Record<string, unknown>;
  chatId?: string;
}
```

### API Client (Auto-Generated)

`api.ts` is auto-generated from `apiDependencies`. It provides typed wrapper functions:

```typescript
import { createWorkflowApis, type ExecutionResult } from '../workflows/api';

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

### JsonSchema and AI Prompts

Use `JsonSchema` for structured AI responses:

```typescript
import type { JsonSchema } from '@greaseclaw/workflow-sdk';

const schema: JsonSchema = {
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
        },
      },
    },
  },
};
```

## Part 3: Writing Workflows

A workflow is a TypeScript file with a YAML frontmatter header and an `execute()` function.

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

## Part 4: Writing Pages

Pages are interactive HTML views served by the agent. Each page consists of:
- A TypeScript component file (`*.ts`) that manipulates the DOM
- An HTML template file (`*.html`) that provides the shell

### HTML Template

Minimal template with module script import:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Simple Attention Portfolio</title>
    <link rel="stylesheet" href="./styles.css">
    <script type="module" src="./simple.ts"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

The `<div id="app">` is the render target. The script loads as a module.

### Page Component (TypeScript)

Pages use vanilla JS/TS with no framework. Pattern: render HTML strings into `#app`, then bind events.

```typescript
import { Agent } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis } from '../workflows/api';
import { saveInterestField, saveKols, type Source } from '../shared';

// DOM helpers
const app = document.querySelector('#app') as HTMLElement;
const $ = <T extends HTMLElement>(sel: string, root?: HTMLElement): T | null =>
  root?.querySelector<T>(sel) ?? document.querySelector<T>(sel);

// Agent instance (available in browser via window.agentOptions)
const agent = new Agent(window.agentOptions || {});
const apis = createWorkflowApis(agent);

// State
let step = 1;
let loading = false;
let model = emptyModel();

// Render: generate HTML and bind events
function render() {
  app.innerHTML = `<main>${views[step]()}</main>`;
  bindEvents();
}

const views: Record<number, () => string> = {
  1: landingView,
  2: sourcesView,
  3: reportView,
};

function landingView(): string {
  return `<section class="view">
    <h1>Simple attention portfolio</h1>
    <button class="primary" id="start">生成组合</button>
  </section>`;
}

function bindEvents() {
  $('#start')?.addEventListener('click', start);
  $('#back')?.addEventListener('click', () => { step = Math.max(1, step - 1); render(); });
  $('#next')?.addEventListener('click', () => { step = Math.min(3, step + 1); render(); });
}

// Initial render
render();
```

### Page Architecture Patterns

**Step-based wizard:**
```typescript
let step = 1;
function render() {
  app.innerHTML = `<main>${views[step]()}</main>`;
  bindEvents();
}
// Navigation: step++ / step--, render() on each change
```

**Data table with sync:**
```typescript
let tweets: SavedTweet[] = [];
let syncing = false;

async function loadTweets() {
  tweets = await getSavedTweets(agent, 500);
  render();
}

async function startSync() {
  syncing = true;
  render();
  const result = await syncListTweets(agent, { onProgress: (p) => { syncProgress = p; render(); } });
  await loadTweets();
  syncing = false;
  render();
}
```

**Progress/loading overlay:**
```typescript
let loading = false;
let loadingState = { title: '', message: '', progress: 8, steps: [] };

function startLoading(title: string, message: string, steps: string[]) {
  loading = true;
  loadingState = { title, message, progress: 8, steps: steps.map(...) };
  render();
}

function updateLoading(message: string, progress: number, activeIndex?: number) {
  loadingState = { ...loadingState, message, progress, steps: ... };
  render();
}

function stopLoading() { loading = false; }
```

### Using Agent APIs in Pages

Pages can call workflow APIs directly from the browser:

```typescript
const response = await apis.twitter_list_tweets(listId, limit);
const response = await apis.twitter_list_add(listId, username);
const response = await apis.twitter_list_members(listId, 500);
```

Use the same `callWithLimit` rate-limiting pattern in pages to avoid overloading APIs.

### Using Database in Pages

Pages can read/write Dexie directly:

```typescript
const tweets = await getSavedTweets(agent, 500);
await saveInterestField(agent, topic, model);
await saveKols(agent, topic, sources);
await saveLists(agent, topic, listRecords);
```

### XSS Prevention

Always escape dynamic content in HTML templates:

```typescript
import { escapeHtml, escapeAttr } from '../shared';

// In text content
`<h3>${escapeHtml(source.name)}</h3>`

// In attribute values
`<button data-id="${escapeAttr(source.id)}">`

// In URLs
`<a href="${escapeAttr(tweet.url)}" target="_blank">`
```

## Part 5: Shared Module

The `shared/` directory contains reusable utilities that both workflows and pages import.

### Types (`types.ts`)

Define all shared types here:

```typescript
export type Source = {
  name?: string;
  handle?: string;
  type?: string;
  role?: string;
  focus?: number;
  diversity?: number;
  state?: 'new' | 'add' | 'ignore' | 'existing';
};

export type SavedTweet = {
  id: string;
  interestId?: string;
  author?: string;
  text?: string;
  url?: string;
  likes?: number;
  createdAt?: string;
};
```

### Utils (`utils.ts`)

Common utilities for extracting data from `ExecutionResult`:

| Function | Purpose |
|----------|---------|
| `extractSearchTweets(result)` | Extract `SearchTweet[]` from API response |
| `extractTwitterLists(result)` | Extract `TwitterList[]` from API response |
| `extractTwitterUserCandidates(result, source)` | Extract `TwitterUserCandidate[]` from API response |
| `cleanHandle(value)` | Strip `@` prefix, trim handle |
| `escapeHtml(value)` | Escape HTML entities (`&`, `<`, `>`, `"`, `'`) |
| `escapeAttr(value)` | Escape for HTML attributes (includes backticks) |
| `initials(value)` | Get first letters of each word (for avatars) |
| `clampNumber(value, min, max)` | Clamp a number to range |
| `unique(values)` | Deduplicate array, remove falsy values |
| `sleep(ms)` | Promise-based setTimeout |

### Database (`db.ts`)

Database operations with Dexie:

| Function | Purpose |
|----------|---------|
| `interestIdFor(topic)` | Normalize topic string to ID (lowercase, alphanumeric + CJK) |
| `getPortfolioDb(agent)` | Initialize/open Dexie database (version 3) |
| `saveInterestField(agent, topic, model, selectedGoals)` | Save interest metadata |
| `saveKols(agent, topic, sources)` | Bulk save KOL records |
| `saveKolCandidates(agent, topic, candidates)` | Bulk save candidate records |
| `saveLists(agent, topic, lists)` | Save list records (key, name, listId, mode) |
| `saveTweets(agent, topic, list, tweets)` | Save tweets (dedup by ID, merge listIds/listNames) |
| `getSavedTweets(agent, limit)` | Get recent tweets ordered by savedAt |
| `querySavedTweets(agent, options)` | Query with filters: date, keyword, interest, author |
| `getSavedLists(agent)` | Get all saved list records |
| `getAllInterestFields(agent)` | Get all interest topics |

### Sync (`sync.ts`)

Sync utilities for reconciling local and remote data:

| Function | Purpose |
|----------|---------|
| `syncListTweets(agent, options)` | Sync tweets from X.com lists, with progress callback |
| `syncListMembers(agent, options)` | Sync list members bidirectional (local <-> X.com) |

Both support `onProgress` callbacks for real-time UI updates.

## Part 6: Build and Deploy

### Build

```bash
cd workflows
pnpm install
pnpm run build    # Builds src -> dist (JS + HTML pages)
```

The build script (`workflow-build.mjs`) bundles TypeScript source and HTML pages into `dist/`.

### Dev Mode

```bash
pnpm run dev      # Watch mode with hot reload
```

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

Pages appear in `dist/pages/` after build. Workflow JS files appear in `dist/`.

### API Auto-Generation

When `apiDependencies` change, regenerate `api.ts`:
1. Update `apiDependencies` in `agent.json`
2. The system regenerates `workflows/src/api.ts` with typed methods for each API endpoint
3. **Never edit `api.ts` manually** - changes will be overwritten