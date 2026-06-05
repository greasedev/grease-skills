---
name: grease-api-builder
description: Build Grease API JSON for browser automation. 1) Understand format & directory structure 2) Build from scratch 3) Scripts usage.
user-invocable: true
---

# Grease Api Builder

Build GreaseAI-compatible JSON for browser automation workflows.

> **Dependency**: Requires [greasedev/automator](https://github.com/greasedev/automator) which adds `driver-layer` export and `async (intermediate) => {}` pattern.

---

## Part 1: Directory Structure & JSON Format

### Directory Structure

```
skills/grease-api-builder/
├── SKILL.md
├── package.json
├── tsconfig.json
├── scripts/
│   ├── test.ts                 # Test script
│   └── locate-element.ts       # Element locator for single-step debugging
└── clis/                       # Output directory
    ├── zhihu/
    │   ├── hot.json            # API definition
    │   ├── hot.test            # Test log (auto-generated)
    │   ├── search.json
    │   └── ...
    ├── bilibili/
    │   ├── hot.json
    │   └── ...
    └── twitter/
        ├── search.json
        └── ...
```

**Mapping rule**: `clis/{site}/{command}.json` (GreaseApi)

### GreaseApi JSON Format

```json
{
  "actions": [
    {
      "action": "open",
      "argument": { "url": "https://...", "waitUntil": "load" },
      "description": "Open target website homepage"
    },
    {
      "action": "evaluate",
      "argument": { "script": "async (intermediate) => { ... }" },
      "description": "Fetch hot list API and extract data"
    }
  ],
  "api_endpoint": "{domain}-{command}",
  "category": "scrape",
  "description": "命令描述",
  "is_public": true,
  "method": "GET",
  "name": "Hot",
  "output_schema": [
    { "name": "title", "type": "string", "description": "标题" },
    { "name": "rank", "type": "number", "description": "排名" }
  ],
  "variables": [
    { "name": "limit", "type": "int", "default": 20, "help": "Number of items", "test": 5 }
  ],
  "website_domain": "www.zhihu.com",
  "website_id": "website-www.zhihu.com"
}
```

#### api_endpoint Format

`{domain}-{command}` format, globally unique:
- Remove `www.` prefix and `.com` suffix from domain
- Lowercase with hyphens

| Command | api_endpoint |
|---------|-------------|
| `bilibili hot` | `bilibili-hot` |
| `zhihu search` | `zhihu-search` |
| `36kr hot` | `36kr-hot` |

#### output_schema Format

Describe API output fields:

| Common field | type | description |
|-------------|------|------------|
| `rank` | `number` | 排名 |
| `title`, `url`, `author`, `description` | `string` | 标题/链接/作者/描述 |
| `play`, `views`, `count` | `number` | 播放量/浏览量/数量 |

#### variables Format

Input parameters with `help` description and `test` value for automated testing:

```json
"variables": [
  { "name": "limit", "type": "int", "default": 20, "help": "Number of videos", "test": 5 },
  { "name": "keyword", "type": "string", "required": true, "help": "Search keyword", "test": "AI" }
]
```

**test field**: Test script reads `variables.test` values automatically — no manual params needed:

```bash
npm run test -- ./clis/zhihu/question.json  # uses variables.test values automatically
```

### Action Types Reference

```typescript
type ActionType = "click" | "close" | "evaluate" | "extract" | "extractList" | "goBack" | "input" | "loop" | "open" | "refresh" | "screenshot" | "scroll" | "scrollTarget" | "track" | "wait" | "waitPage" | "waitTarget";
```

| Action | Argument | Purpose |
|--------|----------|---------|
| `open` | `url`, `waitUntil` | Navigate to URL |
| `close` | `tab`: `"current" | "others" | "all"` | Close browser tab |
| `goBack` | — | Navigate back |
| `refresh` | — | Reload page |
| `screenshot` | — | Take screenshot, returns `image_buffer` |
| `click` | `target` + TargetElement | Click element |
| `scroll` | `location`: `"top" | "bottom" | "nextPage" | "prevPage"` | Scroll page |
| `scrollTarget` | `target` + TargetElement | Scroll element into view |
| `input` | `target`, `text`, `delay`, `withReturn` | Type text into element |
| `extract` | `target`, `contentType` + TargetElement | Extract single content |
| `extractList` | `target`, `contentType` + TargetElement | Extract list content (sets `isList: true`) |
| `evaluate` | `script` | Execute JavaScript, receives intermediate results |
| `track` | `urlPattern`, `script` | Intercept network requests matching URL pattern, execute script on each response |
| `loop` | `script`, `intervalMs` | Repeatedly execute script until it returns `false`, with interval between executions |
| `wait` | `timeMs` | Wait duration (milliseconds) |
| `waitPage` | `loadState`: `"load" | "domcontentloaded" | "networkidle"` | Wait for page state |
| `waitTarget` | `target` + TargetElement | Wait for element |

**contentType options**: `"text" | "link" | "markdown" | "html" | "all"`

### Action Description Field

Each action can include an optional `description` field that serves as a comment explaining the step's purpose. This helps AI agents understand the workflow when re-planning or regenerating APIs.

```json
{
  "action": "track",
  "argument": { "urlPattern": "api/search", "script": "async (globalVars) => { ... }" },
  "description": "Intercept search API responses and extract product data"
}
```

**Guidelines**:
- Use concise English descriptions (e.g., "Open homepage", "Intercept search API", "Loop pagination until enough data collected")
- Focus on the **purpose** of the step, not what the action type already implies
- Especially useful for `evaluate` and `loop` scripts where the intent is not obvious from the code
- Not required for trivial steps like `wait`

### Script Return Value Convention

All inline scripts (`evaluate`, `track`, `loop`) follow the same return value handling rule via `handleScriptResult`:

| Return type | Behavior |
|-------------|----------|
| **Array** | Elements are appended to `globalVars.extractData` (final output data) |
| **Object** | Fields are merged into `globalVars` (intermediate state for subsequent steps) |
| **`null` / `undefined` / `false` | Ignored, no side effects. For `loop`, returning `false` also stops the loop |

**Key rules**:

1. **Array → extractData**: Return an array when producing output records. Each element becomes one row in the final result. Multiple script executions (loop iterations, multiple tracked responses) merge arrays via `push(...result)`.

```javascript
// Output records — appended to extractData
return [{ title: "xxx", rank: 1 }, { title: "yyy", rank: 2 }];

// Detail page — wrap single item in array
return [{ title: item.title, price: price.priceText }];
```

2. **Object → globalVars**: Return an object when passing intermediate state to subsequent steps. Each field replaces the corresponding `globalVars` field.

```javascript
// Pass noteId to next action
return { noteId: "abc123" };
// Now available as: {{ noteId }} in evaluate, {noteId} / ${noteId} in other actions

// Track: accumulate page count
return { pageCount: (globalVars.pageCount || 0) + 1 };
```

3. **Array + Object combined**: If you need both output data and intermediate state, return an **object** with an `extractData` field containing the array plus other state fields. The runtime will merge `extractData` into the existing array and other fields into `globalVars`.

```javascript
return {
  extractData: [{ title: "xxx" }],
  pageCount: globalVars.pageCount + 1
};
```

4. **Why arrays matter**: The runtime uses `extractData` (the accumulated array) to determine the final API output. A non-array return does not produce output rows — it only updates `globalVars` for subsequent steps.

### Evaluate Action

### Track Action (Network Interception)

`track` intercepts network requests matching a URL pattern and processes each response through a script. It must be placed **before** the `open` action that triggers the network requests.

**Arguments**:
- `urlPattern`: String pattern to match in request URLs (substring match)
- `script`: `async (globalVars) => {}` — receives `globalVars.response` with the intercepted response

**How it works**:
1. Registers a network listener for URLs containing `urlPattern`
2. When a matching response arrives, executes `script` with `globalVars.response` containing `body`, `url`, `status`, etc.
3. Each script result is processed by `handleScriptResult`: arrays → appended to `extractData`, objects → merged into `globalVars`
4. Subsequent actions (open, scroll, etc.) trigger the tracked requests

```javascript
// track script — return array to append to extractData
async (globalVars) => {
  const response = globalVars.response;
  let body = response.body;
  if (typeof body === 'string') body = JSON.parse(body);
  return [{ title: body.data.title, price: body.data.price }];
}
```

**Common patterns**:
- **Detail page** (jd/detail, taobao/detail): Track API → Open page → Wait → Browse (human behavior)
- **Search page** (pdd/search, taobao/search): Track API → Open → Input → Wait → Loop scroll → Dedup evaluate

### Loop Action (Repeated Execution)

`loop` repeatedly executes a script at a fixed interval until the script returns `false`. Used for pagination, infinite scroll, or collecting data across multiple page loads.

**Arguments**:
- `script`: `async (globalVars) => {}` — executed repeatedly; see Script Return Value Convention for result handling
- `intervalMs`: Milliseconds between each execution

**How it works**:
1. Executes `script` with access to `globalVars` (including `globalVars.extractData` from track)
2. Each script result is processed by `handleScriptResult`: arrays → appended to `extractData`, objects → merged into `globalVars`
3. If script returns `false`, the loop stops (handled before `handleScriptResult`, so `false` is not stored)
4. Waits `intervalMs` between executions
5. After loop ends, execution continues to the next action

**Stop conditions** (return `false`):
- `globalVars.extractData.length >= limit` — enough data collected
- `globalVars.pageCount > maxPages` — max pages reached
- No more content available (e.g., no "next" button)

```javascript
// loop script — return object to update globalVars, or false to stop
async (globalVars) => {
  const limit = {{ limit }} || 20;
  const maxPages = 5;
  const data = globalVars.extractData || [];
  if (data.length >= limit) return false;
  globalVars.pageCount = (globalVars.pageCount || 0) + 1;
  if (globalVars.pageCount > maxPages) return false;
  // Scroll to load more or click next page
  window.scrollTo(0, document.documentElement.scrollHeight);
  return { pageCount: globalVars.pageCount };  // object → merged into globalVars
}
```

**Common patterns**:
- **With track**: Track returns arrays → `extractData`, loop returns objects → `globalVars` state updates (page count, etc.)
- **Without track**: Loop can return arrays for DOM extraction on each iteration, accumulating into `extractData`
- **Post-loop dedup**: After loop, use an `evaluate` action to deduplicate and limit `globalVars.extractData`

### TargetElement & Selector

Actions targeting elements can include:

```typescript
interface TargetElement {
  selectors?: Selector[];
  xpath?: string;
  isList?: boolean;
}

interface Selector {
  selector: string;
  isList?: boolean;
  child_selector?: string;
  reason?: string;
  nth?: number;
}
```

### Template Variable Syntax

| Syntax | Replaces | Used In |
|--------|----------|---------|
| `{{ xxx }}` | Task params (before script execution) | `evaluate` scripts only |
| `{xxx}` | Task params (before action execution) | All actions except evaluate |
| `${xxx}` | Intermediate results (before action execution) | All actions except evaluate |

**Key**: evaluate scripts use `{{ }}` for task params; all other actions use `{xxx}` for task params and `${xxx}` for previous evaluate results.

**Intermediate results flow**: After each successful evaluate, its return value is saved to `globalVars` and available via `intermediate.xxx` in subsequent evaluate scripts, or `${xxx}` in subsequent non-evaluate actions.

---

## Part 2: Build from Scratch

Build GreaseApi JSON directly.

### Workflow

1. **Identify the target**: Determine website, API endpoint, and what data to extract
2. **Choose strategy**: API-based (evaluate with fetch) vs. UI-based (click/input/extract)
3. **Write actions**: Compose the action sequence
4. **Define metadata**: Set api_endpoint, category, variables, output_schema
5. **Test**: Run `npm run test -- ./clis/{site}/{command}.json`

### API-Based (Fetch)

For sites with accessible APIs:

```json
{
  "actions": [
    { "action": "open", "argument": { "url": "https://www.zhihu.com", "waitUntil": "load" }, "description": "Open Zhihu homepage" },
    {
      "action": "evaluate",
      "argument": {
        "script": "async (intermediate) => { const res = await fetch('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit={{ limit }}', { credentials: 'include' }); const d = await res.json(); return (d?.data || []).map((item, i) => ({ rank: i + 1, title: item.target?.title })); }"
      },
      "description": "Fetch hot list API and extract data"
    }
  ],
  "api_endpoint": "zhihu-hot",
  "category": "scrape",
  "description": "知乎热榜",
  "is_public": true,
  "method": "GET",
  "name": "Hot",
  "output_schema": [
    { "name": "rank", "type": "number", "description": "排名" },
    { "name": "title", "type": "string", "description": "标题" }
  ],
  "variables": [
    { "name": "limit", "type": "int", "default": 20, "help": "Number of items", "test": 5 }
  ],
  "website_domain": "www.zhihu.com",
  "website_id": "website-www.zhihu.com"
}
```

### UI-Based (Click/Extract)

For sites requiring browser interaction:

```json
{
  "actions": [
    { "action": "open", "argument": { "url": "https://weibo.com", "waitUntil": "networkidle" }, "description": "Open Weibo homepage" },
    { "action": "input", "argument": { "target": "Search input", "text": "{{ keyword }}", "withReturn": true },
      "selectors": [{ "selector": "input[type='search']", "reason": "Search box" }],
      "description": "Type search keyword"
    },
    { "action": "waitPage", "argument": { "loadState": "networkidle" }, "description": "Wait for search results to load" },
    {
      "action": "extractList",
      "argument": { "target": "Search results", "contentType": "text" },
      "selectors": [{ "selector": ".result-list .result-item", "reason": "Result items" }],
      "description": "Extract search result items"
    }
  ]
}
```

### Multi-Step with Intermediate Results

Chain evaluate actions where later steps use earlier results:

```json
{
  "actions": [
    { "action": "open", "argument": { "url": "https://example.com" }, "description": "Open target site" },
    {
      "action": "evaluate",
      "argument": { "script": "async (intermediate) => { const noteId = 'xxx'; return { noteId }; }" },
      "description": "Extract note ID from page"
    },
    {
      "action": "open",
      "argument": { "url": "https://example.com/detail/${noteId}" },
      "description": "Navigate to detail page using extracted ID"
    },
    {
      "action": "evaluate",
      "argument": { "script": "async (intermediate) => { const detail = intermediate.noteId; return { title: '...' }; }" },
      "description": "Extract detail data"
    }
  ]
}
```

---

## Part 3: Scripts

### test.ts — Full API Test

Runs a GreaseApi JSON file end-to-end in a real browser.

```bash
npm run test -- ./clis/36kr/hot.json
npm run test -- ./clis/zhihu/search.json --params '{"query":"AI","limit":5}'
```

**Options**:

| Flag | Description |
|------|-------------|
| `--cdp <url>` | CDP URL (default: `http://localhost:9222`) |
| `--params <json>` | Parameters as JSON string |

**How it works**:
1. Loads the JSON file, applies `variables.test` values as params if no `--params` provided
2. Creates a debug browser task and runs it via `runTask`
3. Extracts results from `getDebugTaskResult()`, filters fields by `output_schema`
4. Writes a `.test` log file alongside the JSON

**Test log** (`.test` file, auto-generated):

```json
{
  "timestamp": "2026-04-10T13:20:45.123Z",
  "json_file": "./clis/bilibili/hot.json",
  "command": "Hot",
  "website": "www.bilibili.com",
  "params": { "limit": 20 },
  "success": true,
  "data_count": 20,
  "sample_data": [ ... ]
}
```

### test-track.ts — Track Script Unit Test with Sample Data

Tests whether a `track` action script can correctly parse a saved API response (`.sample` file) without needing a live browser. Useful for iterating on track scripts quickly.

```bash
npx tsx scripts/test-track.ts ./clis/jd/detail.json
```

**How it works**:
1. Loads the JSON file and finds the `track` action's script
2. Looks for a `.sample` file next to the JSON (e.g. `detail.json` → `detail.sample`)
3. Resolves template variables (`{{ xxx }}`) using `variables.test` / `variables.default` values
4. Executes the track script with `globalVars = { response: { body: <sample content> }, extractData: [] }`
5. Validates the returned array against `output_schema` (field presence and type checking)

**Creating .sample files**: Save a raw API response body (JSON string) from the browser's network panel into a `.sample` file next to the JSON. This allows offline testing of track scripts.

```bash
# Example: save a tracked API response
echo '{"data":{"items":[...]}}' > clis/jd/detail.sample
```

### locate-element.ts — Single-Step Element Relocator

Re-locates a specific step's element selector by running all preceding steps then pausing for AI-driven element discovery. Use when a selector breaks or a new target description is needed.

```bash
# Re-locate element at step index 3
npx tsx scripts/locate-element.ts clis/weibo/group-create.json 3

# With a new target description
npx tsx scripts/locate-element.ts clis/weibo/group-create.json 3 "Create group button"
```

**How it works**:
1. Reads the JSON file and splits actions at the target step index
2. Runs all preceding actions normally, then clears `selectors` and `xpath` on the target step
3. The AI agent re-discovers the element from the current page state
4. Returns updated selector information in the log

**When to use**:
- A selector breaks after a site redesign
- You need a different element for an existing step
- You want to verify which element a step targets

---

## Prerequisites

1. **Mises Browser**: Required browser for running and testing APIs
2. **LLM API Key**: `export DOUBAO_API_KEY=your_key` or `export OPENAI_API_KEY=your_key`

## Mandatory Test Requirements

- Every JSON file must have a `.test` log file
- Test log must show `success: true`
- Fix JSON if test fails, then re-test

---

## Twitter/X Rate Limits

Twitter GraphQL API has strict rate limits:
- **Space tests at least 30 seconds apart**
- **API-based read commands** (tweets, timeline, search, etc.) count against rate limits
- **DOM-based commands** (trending, followers, download) are less rate-limited but need login
- **Write commands** (follow, like, post, etc.) modify state — test with caution
- **Use `--limit 3` or `--limit 5`** to minimize payload
- **If HTTP 429**, wait 5-15 minutes
- **Requires Chrome with active x.com login session**