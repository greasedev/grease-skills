---
name: grease-api-builder
description: Build Grease API JSON for browser automation. 1) Understand format & directory structure 2) Build from scratch 3) Convert OpenCLI commands to GreaseApi format.
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
└── clis/                       # Output directory, mirrors OpenCLI clis structure
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

**Mapping rule**: `clis/{site}/{command}.ts` (OpenCLI) → `clis/{site}/{command}.json` (GreaseApi)

### GreaseApi JSON Format

```json
{
  "actions": [
    {
      "action": "open",
      "argument": { "url": "https://...", "waitUntil": "load" }
    },
    {
      "action": "evaluate",
      "argument": { "script": "async (intermediate) => { ... }" }
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

**test field**: Extracted from OpenCLI `.test.ts` files. Test script reads it automatically — no manual params needed:

```bash
npm run test -- ./clis/zhihu/question.json  # uses variables.test values automatically
```

### Action Types Reference

```typescript
type ActionType = "click" | "close" | "evaluate" | "extract" | "extractList" | "goBack" | "input" | "open" | "refresh" | "screenshot" | "scroll" | "scrollTarget" | "wait" | "waitPage" | "waitTarget";
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
| `wait` | `timeMs` | Wait duration (milliseconds) |
| `waitPage` | `loadState`: `"load" | "domcontentloaded" | "networkidle"` | Wait for page state |
| `waitTarget` | `target` + TargetElement | Wait for element |

**contentType options**: `"text" | "link" | "markdown" | "html" | "all"`

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

When no OpenCLI source exists, build GreaseApi JSON directly.

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
    { "action": "open", "argument": { "url": "https://www.zhihu.com", "waitUntil": "load" } },
    {
      "action": "evaluate",
      "argument": {
        "script": "async (intermediate) => { const res = await fetch('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit={{ limit }}', { credentials: 'include' }); const d = await res.json(); return (d?.data || []).map((item, i) => ({ rank: i + 1, title: item.target?.title })); }"
      }
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
    { "action": "open", "argument": { "url": "https://weibo.com", "waitUntil": "networkidle" } },
    { "action": "input", "argument": { "target": "Search input", "text": "{{ keyword }}", "withReturn": true },
      "selectors": [{ "selector": "input[type='search']", "reason": "Search box" }]
    },
    { "action": "waitPage", "argument": { "loadState": "networkidle" } },
    {
      "action": "extractList",
      "argument": { "target": "Search results", "contentType": "text" },
      "selectors": [{ "selector": ".result-list .result-item", "reason": "Result items" }]
    }
  ]
}
```

### Multi-Step with Intermediate Results

Chain evaluate actions where later steps use earlier results:

```json
{
  "actions": [
    { "action": "open", "argument": { "url": "https://example.com" } },
    {
      "action": "evaluate",
      "argument": { "script": "async (intermediate) => { const noteId = 'xxx'; return { noteId }; }" }
    },
    {
      "action": "open",
      "argument": { "url": "https://example.com/detail/${noteId}" }
    },
    {
      "action": "evaluate",
      "argument": { "script": "async (intermediate) => { const detail = intermediate.noteId; return { title: '...' }; }" }
    }
  ]
}
```

### Element Locator (Single-Step Debugging)

When UI selectors are wrong, use `scripts/locate-element.ts` to re-locate:

```bash
# Re-locate element at step index 3
npx tsx scripts/locate-element.ts clis/weibo/group-create.json 3

# With new target description
npx tsx scripts/locate-element.ts clis/weibo/group-create.json 5 "新建分组按钮"
```

---

## Part 3: Convert OpenCLI to GreaseApi Format

Convert existing OpenCLI commands to GreaseApi JSON.

### Conversion Workflow

1. **Read OpenCLI source**: Find the `.ts` file in OpenCLI `clis/` directory
2. **Analyze command structure**: Extract `site`, `name`, `description`, `domain`, `args`, `columns`, `pipeline`, `strategy`
3. **Convert to GreaseApi format**: Apply mapping rules below
4. **Write output JSON**: Save to `clis/{site}/{command}.json`
5. **Test and validate**: Run test, verify `comparison.match: true`

### Action Type Mapping

| OpenCLI Pipeline Step | GreaseApi Action |
|----------------------|-----------------|
| `navigate` | `open` |
| `evaluate` | `evaluate` |
| `click` (in func) | `click` |
| `typeText` (in func) | `input` |
| `wait` | `wait` |
| `scroll` | `scroll` |

### Strategy to Category

| OpenCLI Strategy | GreaseApi Category |
|-----------------|-------------------|
| `PUBLIC` | `scrape` |
| `COOKIE` | `scrape` (requires login session) |
| `HEADER` | `auth` |
| `INTERCEPT` | `intercept` |
| `UI` | `interact` |

### Template Variable Conversion

| OpenCLI | GreaseApi |
|---------|----------|
| `${{ args.limit }}` | `{{ limit }}` (in evaluate) or `{limit}` (in other actions) |
| `${{ args.keyword }}` | `{{ keyword }}` or `{keyword}` |

### Variable Conversion

```typescript
// OpenCLI args
args: [
  { name: 'limit', type: 'int', default: 20, help: 'Number of videos' },
  { name: 'keyword', type: 'str', required: true, help: 'Search keyword' }
]

// GreaseApi variables
"variables": [
  { "name": "limit", "type": "int", "default": 20, "help": "Number of videos", "test": 5 },
  { "name": "keyword", "type": "string", "required": true, "help": "Search keyword", "test": "AI" }
]
```

**test value extraction**: Find the corresponding `.test.ts` file, extract parameter values from test calls like `cmd!.func!(page, { id: 'xxx', limit: 3 })`, and add them as `test` fields.

### Complete Conversion Example

**Input**: `clis/36kr/hot.ts`

```typescript
cli({
  site: '36kr',
  name: 'hot',
  description: '36氪热榜',
  domain: '36kr.com',
  args: [
    { name: 'limit', type: 'int', default: 20 },
  ],
  columns: ['rank', 'title', 'url'],
  pipeline: [
    { navigate: 'https://36kr.com' },
    { evaluate: `(async () => {
      const res = await fetch('https://gateway.36kr.com/api/mis/nav/home/nav/v2', {
        credentials: 'include'
      });
      const d = await res.json();
      return (d?.data?.hotNewsList || []).map(item => ({
        title: item.title,
        url: item.url,
      }));
    })()` },
    { limit: '${{ args.limit }}' },
  ],
});
```

**Output**: `clis/36kr/hot.json`

```json
{
  "actions": [
    { "action": "open", "argument": { "url": "https://36kr.com", "waitUntil": "load" } },
    {
      "action": "evaluate",
      "argument": {
        "script": "async (intermediate) => { const res = await fetch('https://gateway.36kr.com/api/mis/nav/home/nav/v2', { credentials: 'include' }); const d = await res.json(); return (d?.data?.hotNewsList || []).map(item => ({ title: item.title, url: item.url })); }"
      }
    }
  ],
  "api_endpoint": "36kr-hot",
  "category": "scrape",
  "description": "36氪热榜",
  "is_public": true,
  "method": "GET",
  "name": "Hot",
  "output_schema": [
    { "name": "rank", "type": "number", "description": "排名" },
    { "name": "title", "type": "string", "description": "标题" },
    { "name": "url", "type": "string", "description": "链接" }
  ],
  "variables": [
    { "name": "limit", "type": "int", "default": 20, "help": "Number of items" }
  ],
  "website_domain": "36kr.com",
  "website_id": "website-36kr.com"
}
```

**Key changes in conversion**:
1. `navigate` → `open` action with `waitUntil`
2. IIFE `(async () => {...})()` → `async (intermediate) => {...}`
3. `${{ args.limit }}` → `{{ limit }}` (or remove if processed in evaluate)
4. `columns` → `output_schema`
5. `args` → `variables`
6. `limit` pipeline step → handled inside evaluate script via `{{ limit }}`

### Conversion Troubleshooting

| Issue | Solution |
|-------|----------|
| No fetch URL in evaluate | Command uses UI strategy — generate click/input/extract actions |
| Complex evaluate code | Extract fetch call, simplify script |
| Template mismatch | Replace `${{ args.xxx }}` with `{{ xxx }}` |
| Multiple API calls | Chain evaluate actions, pass results via intermediate |
| `networkidle` timeout | Change waitUntil to `load` |
| API returns -403 | Check auth requirements or use simpler endpoint |
| StagehandEvalError | Convert IIFE to `async (intermediate) => {}` pattern |

---

## Testing

All JSON files must be tested. Test logs are auto-generated as `.test` files alongside each JSON.

```bash
npm install

# Test single file (with OpenCLI comparison by default)
npm run test -- ./clis/36kr/hot.json

# Test with params (use = to avoid shell parsing issues)
npm run test -- ./clis/zhihu/search.json --params='{"query":"AI","limit":5}'
```

### Test Options

```bash
npm run test -- <json-file> [options]

Options:
  --cdp <url>       CDP URL (default: http://localhost:9222)
  --params <json>   Parameters as JSON string
  --no-compare      Disable OpenCLI comparison (only for local commands)
  --site <name>     Override OpenCLI command name
```

### Test Log Format

Each test generates a `.test` file:

```json
{
  "timestamp": "2026-04-10T13:20:45.123Z",
  "json_file": "./clis/bilibili/hot.json",
  "command": "Hot",
  "website": "www.bilibili.com",
  "params": { "limit": 20 },
  "success": true,
  "data_count": 20,
  "sample_data": [ ... ],
  "comparison": {
    "grease_count": 20,
    "opencli_count": 20,
    "match": true,
    "differences": []
  }
}
```

### Prerequisites

1. **Chrome with remote debugging**: `chrome --remote-debugging-port=9222`
2. **LLM API Key**: `export DOUBAO_API_KEY=your_key` or `export OPENAI_API_KEY=your_key`
3. **OpenCLI** (for comparison): `npm install -g @jackwener/opencli`

### Mandatory Test Requirements

- Every JSON file must have a `.test` log file
- Test log must show `comparison.match: true`
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