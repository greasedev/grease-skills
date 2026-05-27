---
name: grease-api-builder
description: Build Grease API, 1 Build from scratch 2 Convert OpenCLI commands to GreaseAI-compatible JSON format. Use when you need to generate browser automation api for GreaseAI platform.
user-invocable: true
---

# OpenCLI to GreaseAI Converter

Converts OpenCLI CLI commands to GreaseAI-compatible JSON format for browser automation workflows.

> **Dependency**: Requires [greasedev/automator@7024108](https://github.com/greasedev/automator/commit/7024108) which adds `driver-layer` export and `async (intermediate) => {}` pattern.

## Output Directory Structure

生成的 JSON 文件按照 OpenCLI `clis/` 目录结构存放：

```
skills/grease-api-builder/
├── SKILL.md
├── package.json
├── tsconfig.json
├── scripts/                    # 工具脚本
│   ├── test.ts                 # 测试脚本
│   └── locate-element.ts       # 元素定位脚本
└── clis/                       # 输出目录，镜像 OpenCLI clis 结构
    ├── zhihu/
    │   ├── hot.json
    │   ├── search.json
    │   └── ...
    ├── bilibili/
    │   ├── hot.json
    │   └── ...
    └── 36kr/
        └── hot.json
```

**映射规则**：
- `clis/36kr/hot.ts` → `clis/36kr/hot.json`
- `clis/zhihu/search.ts` → `clis/zhihu/search.json`

---

## Output Format

GreaseAI JSON structure:
```json
{
  "actions": [
    {
      "action": "open",
      "argument": { "url": "https://..." }
    },
    {
      "action": "evaluate",
      "argument": { "script": "async (intermediate) => { ... }" }
    }
  ],
  "api_endpoint": "{domain}-{command}",
  "category": "interact|search|scrape|auth|payment|other",
  "description": "命令描述",
  "is_public": true,
  "method": "GET|POST",
  "name": "CommandName",
  "output_schema": [
    { "name": "field1", "type": "string", "description": "字段描述" },
    { "name": "field2", "type": "number", "description": "字段描述" }
  ],
  "website_domain": "example.com",
  "website_id": "website-example.com"
}
```

### api_endpoint 格式

使用 `{domain}-{command}` 格式确保全局唯一：
- 移除域名前缀（如 `www.`）
- 移除域名后缀（如 `.com`）
- 使用小写和连字符

示例：
| OpenCLI 命令 | api_endpoint |
|-------------|--------------|
| `bilibili hot` | `bilibili-hot` |
| `zhihu search` | `zhihu-search` |
| `36kr hot` | `36kr-hot` |
| `www.zhihu.com hot` | `zhihu-hot` |

### output_schema 格式

从 OpenCLI `columns` 字段生成输出格式描述：

| OpenCLI column | output_schema type |
|----------------|-------------------|
| `rank` | `number` |
| `title`, `author`, `url`, `description` | `string` |
| `play`, `danmaku`, `count`, `views` | `number` |
| 其他 | `string` (默认) |

示例转换：
```typescript
// OpenCLI
columns: ['rank', 'title', 'author', 'play', 'danmaku']

// GreaseAI
"output_schema": [
  { "name": "rank", "type": "number", "description": "排名" },
  { "name": "title", "type": "string", "description": "视频标题" },
  { "name": "author", "type": "string", "description": "作者" },
  { "name": "play", "type": "number", "description": "播放量" },
  { "name": "danmaku", "type": "number", "description": "弹幕数" }
]
```

### variables 格式

从 OpenCLI `args` 字段生成，包含 `help` 描述和 `test` 测试值：

```typescript
// OpenCLI
args: [
  { name: 'limit', type: 'int', default: 20, help: 'Number of videos' },
  { name: 'keyword', type: 'str', required: true, help: 'Search keyword' }
]

// GreaseAI
"variables": [
  { "name": "limit", "type": "int", "default": 20, "help": "Number of videos", "test": 5 },
  { "name": "keyword", "type": "string", "required": true, "help": "Search keyword", "test": "AI" }
]
```

### test 字段说明

每个 variable 应包含 `test` 字段，提供测试时使用的参数值：

- **来源**: 从 OpenCLI 源文件的 `.test.ts` 测试文件中提取
- **用途**: 用于自动化测试，无需手动指定参数
- **示例**: 
  - `clis/zhihu/question.test.ts` 使用 `{ id: '2021881398772981878', limit: 3 }`
  - 则 `question.json` 的 variables 应添加 `"test": "2021881398772981878"` 和 `"test": 3`

**测试命令会自动读取 test 字段**:
```bash
# 无需手动指定参数
npm run test -- ./clis/zhihu/question.json

# test.ts 会自动使用 variables 中的 test 值构建 params
```

**提取 test 值的方法**:
1. 查找对应的 `.test.ts` 文件
2. 找到测试用例中的参数值（如 `cmd!.func!(page, { id: 'xxx', limit: 3 })`)
3. 将这些值作为 `test` 字段添加到 variables

---

## Action Types (GreaseAI)

Based on `driver-layer.d.ts` ActionType definitions:

```typescript
type ActionType = "click" | "close" | "evaluate" | "extract" | "extractList" | "goBack" | "input" | "open" | "refresh" | "screenshot" | "scroll" | "scrollTarget" | "wait" | "waitPage" | "waitTarget";
```

### ActionType Reference

Based on `executeAction` implementation in driver-layer:

| Action | Argument Fields | Purpose | Implementation |
|--------|----------------|---------|----------------|
| `open` | `url`, `waitUntil` | Navigate to URL | `automator.open(argument.url, argument.waitUntil)` |
| `close` | `tab` | Close browser tab | `automator.close(argument.tab)` where tab: `"current" | "others" | "all"` |
| `goBack` | - | Navigate back | `automator.goBack()` - no arguments needed |
| `refresh` | - | Reload page | `automator.refresh()` - uses default params |
| `screenshot` | - | Take screenshot | `automator.screenshot()` - returns `image_buffer` |
| `click` | `target` + TargetElement | Click element | `automator.click(argument.target, action)` |
| `scroll` | `location` | Scroll page | `automator.scroll(argument.location)` where location: `"top" | "bottom" | "nextPage" | "prevPage"` |
| `scrollTarget` | `target` + TargetElement | Scroll element into view | `automator.scrollTarget(argument.target, action)` |
| `input` | `target`, `text`, `delay`, `withReturn` | Type text | `automator.input(argument.target, argument.text, argument.delay || 1000, argument.withReturn || false, action)` |
| `extract` | `target`, `contentType` + TargetElement | Extract single content | `automator.extract(argument.target, argument.contentType, action)` |
| `extractList` | `target`, `contentType` + TargetElement | Extract list content | `automator.extractList(argument.target, argument.contentType, action)` - sets `isList: true` automatically |
| `evaluate` | `script` | Execute JavaScript | `automator.evaluate(argument.script, context.globalVars)` - receives intermediate results |
| `wait` | `timeMs` | Wait duration | `automator.wait(argument.timeMs)` - milliseconds |
| `waitPage` | `loadState` | Wait for page state | `automator.waitPage(argument.loadState)` where loadState: `"load" | "domcontentloaded" | "networkidle"` |
| `waitTarget` | `target` + TargetElement | Wait for element | `automator.waitTarget(argument.target, action)` |

---

## JSON File Specification

Complete structure of GreaseAI JSON files:

```json
{
  "actions": [GAction[]],
  "api_endpoint": "string",
  "category": "string",
  "description": "string",
  "is_public": "boolean",
  "method": "GET|POST",
  "name": "string",
  "output_schema": [OutputField[]],
  "variables": [Variable[]],
  "website_domain": "string",
  "website_id": "string"
}
```

### actions Array

Each action object (`GAction`) follows this structure:

```typescript
interface GAction {
  action: ActionType;
  argument: Record<string, any>;
  // Optional TargetElement fields (for click, input, extract, etc.)
  selectors?: Selector[];
  xpath?: string;
  isList?: boolean;
}
```

#### Action Examples by Type

**open action**:
```json
{
  "action": "open",
  "argument": {
    "url": "https://example.com",
    "waitUntil": "load"
  }
}
```

**close action**:
```json
{
  "action": "close",
  "argument": {
    "tab": "current"
  }
}
```

**evaluate action**:
```json
{
  "action": "evaluate",
  "argument": {
    "script": "async (intermediate) => { const data = await fetch('/api').then(r => r.json()); return { results: data }; }"
  }
}
```

**click action**:
```json
{
  "action": "click",
  "argument": {
    "target": "Submit button"
  }
}
```
With selector targeting:
```json
{
  "action": "click",
  "argument": {
    "target": "Submit button"
  },
  "selectors": [
    { "selector": "button[type='submit']", "reason": "Submit button selector" }
  ]
}
```

**input action**:
```json
{
  "action": "input",
  "argument": {
    "target": "Search input",
    "text": "{{ query }}",
    "delay": 100,
    "withReturn": true
  }
}
```

**extract/extractList action**:
```json
{
  "action": "extract",
  "argument": {
    "target": "Article content",
    "contentType": "text"
  }
}
```
contentType options: `"text" | "link" | "markdown" | "html" | "all"`

**scroll action**:
```json
{
  "action": "scroll",
  "argument": {
    "location": "bottom"
  }
}
```
location options: `"top" | "bottom" | "nextPage" | "prevPage"`

**wait/waitPage action**:
```json
{
  "action": "wait",
  "argument": {
    "timeMs": 3000
  }
}
```
```json
{
  "action": "waitPage",
  "argument": {
    "loadState": "networkidle"
  }
}
```

### TargetElement Fields

Actions that target elements can include optional targeting fields:

```typescript
interface TargetElement {
  selectors?: Selector[];  // CSS selector array with descriptions
  xpath?: string;          // XPath expression for precise targeting
  isList?: boolean;        // Whether targeting multiple elements
}

interface Selector {
  selector: string;        // CSS selector
  isList?: boolean;        // Matches multiple elements
  child_selector?: string; // Nested element targeting
  reason?: string;         // Why this selector was chosen
  nth?: number;            // Index for multiple matches
}
```

### Template Variable Syntax

| Syntax | Purpose | Replacement Timing | Used In |
|--------|---------|-------------------|---------|
| `{xxx}` | Task parameter | Before action execution (via `renderActionArgument`) | All actions except evaluate |
| `{{ xxx }}` | Task parameter (double brace) | Before script execution (via `renderEvaluateArgument`) | evaluate scripts only |
| `${xxx}` | Intermediate result | Before action execution (via `renderActionArgument`) | All actions except evaluate |

**Key Implementation Details**:

1. **For evaluate actions**: Template rendering uses `renderEvaluateArgument`:
   - Only processes `{{ xxx }}` syntax
   - Replaces with `context.taskParams` values
   - `intermediate` parameter passed via `context.globalVars` (not template replacement)

2. **For other actions**: Template rendering uses `renderActionArgument`:
   - Processes both `{xxx}` and `${xxx}` syntax
   - Merges `context.taskParams` + `context.globalVars` for replacement
   - `{xxx}` → taskParams replacement
   - `${xxx}` → globalVars (intermediate results) replacement

3. **evaluate intermediate results flow**:
   ```javascript
   // After successful evaluate, results saved to globalVars:
   if (response.success === "succeeded" && action.action === "evaluate" && response.extract_data) {
     Object.assign(context.globalVars, response.extract_data);
   }
   ```

### evaluate Script Pattern (greasedev/automator@7024108)

> **Dependency**: Requires [greasedev/automator@7024108](https://github.com/greasedev/automator/commit/7024108)

evaluate action uses **arrow function pattern** to receive intermediateResults:

```javascript
// Step 1: First evaluate - intermediate is empty {}
{
  "action": "evaluate",
  "argument": {
    "script": "async (intermediate) => { const keyword = \"{{ query }}\"; ... return { data, keyword }; }"
  }
}

// Step 2: Second evaluate - intermediate has previous results
{
  "action": "evaluate",
  "argument": {
    "script": "async (intermediate) => { const data = intermediate.data; ... return processedResults; }"
  }
}
```

**Key Points**:
- All evaluate scripts use `async (intermediate) => {}` format
- First evaluate receives empty `{}` intermediate
- Return value is saved to intermediateResults for next evaluate
- Use `intermediate.xxx` to reference previous evaluate's return
- `{{ xxx }}` is replaced with task params (before script execution)
- Last evaluate's return is the final output

**Multi-Step Example** (WBI signing + result processing):
```json
{
  "actions": [
    { "action": "open", "argument": { "url": "https://..." } },
    {
      "action": "evaluate",
      "argument": {
        "script": "async (intermediate) => { /* fetch API with signing */ return { results, searchType }; }"
      }
    },
    {
      "action": "evaluate",
      "argument": {
        "script": "async (intermediate) => { const results = intermediate.results; /* process */ return finalArray; }"
      }
    }
  ]
}
```

---

## Conversion Rules

### Action Type Mapping

| OpenCLI Pipeline Step | GreaseAI Action |
|----------------------|-----------------|
| `navigate` | `open` |
| `evaluate` | `evaluate` (with `script` argument) |
| `click` (in func) | `click` |
| `typeText` (in func) | `input` |
| `wait` | `wait` |
| `scroll` | `scroll` |

### Strategy to Category

| OpenCLI Strategy | GreaseAI Category |
|-----------------|-------------------|
| `PUBLIC` | `public` |
| `COOKIE` | `auth` (implicit) |
| `HEADER` | `auth` |
| `INTERCEPT` | `intercept` |
| `UI` | `ui_action` |

### Variable Template

GreaseAI uses `{{ variable }}` for template placeholders (double braces):

| OpenCLI | GreaseAI |
|---------|----------|
| `${{ args.limit }}` | `{{ limit }}` |
| `${{ args.keyword }}` | `{{ keyword }}` |
| `{username}` | `{{ username }}` |

### Intermediate Results in Non-evaluate Actions

**在 open、click、input 等非 evaluate 操作中也可以引用中间结果**，使用 `${key}` 语法：

```json
{
  "actions": [
    {
      "action": "evaluate",
      "argument": {
        "script": "async (intermediate) => { return { noteId: 'xxx', userId: 'yyy' }; }"
      }
    },
    {
      "action": "open",
      "argument": {
        "url": "https://www.xiaohongshu.com/user/profile/${userId}/${noteId}"
      }
    }
  ]
}
```

**Key Points**:
- `${key}` 在任何 action 的 argument 中都可以使用
- 引用的是前一个 evaluate 返回的对象字段
- 替换发生在 action 执行前，由 driver-layer 自动处理
- 与 `{{ xxx }}` 不同：`{{ }}` 替换 task params，`${}` 替换 intermediate results

**Example - Dynamic URL Navigation**:
```json
{
  "actions": [
    { "action": "open", "argument": { "url": "https://creator.xiaohongshu.com/statistics/data-analysis" } },
    {
      "action": "evaluate",
      "argument": {
        "script": "async (intermediate) => { const notes = await fetch('/api/notes/list').then(r => r.json()); return { firstNoteId: notes.data[0]?.id }; }"
      }
    },
    {
      "action": "open",
      "argument": {
        "url": "https://creator.xiaohongshu.com/statistics/note-detail?noteId=${firstNoteId}"
      }
    }
  ]
}
```

---

## AI-Driven Conversion Workflow

生成过程由 AI 驱动完成，按照以下步骤操作：

### Step 1: Read Source File

读取 OpenCLI 命令源文件：

```bash
# 示例：读取 36kr/hot.ts
cat clis/36kr/hot.ts
```

### Step 2: Analyze Command Structure

分析命令结构：
- `site`, `name`, `description`, `domain`
- `args` 参数定义
- `pipeline` 步骤 (navigate, evaluate, map, limit)
- `strategy` 认证策略

### Step 3: Convert to GreaseAI Format

按照转换规则生成 JSON：

1. **navigate → open action**
   ```json
   {
     "action": "open",
     "argument": { "url": "https://...", "waitUntil": "load" }
   }
   ```

2. **evaluate → evaluate action**
   - 替换 `${{ args.xxx }}` 为 `{{ xxx }}`
   - 保留 `credentials: 'include'`

3. **args → variables**
   - 提取参数定义

### Step 4: Write Output File

写入到对应目录：

```
源文件: clis/36kr/hot.ts
目标:   skills/grease-api-builder/clis/36kr/hot.json
```

---

## Complete Conversion Example

### Input: clis/36kr/hot.ts

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

### Output: clis/36kr/hot.json

```json
{
  "actions": [
    {
      "action": "open",
      "argument": {
        "url": "https://36kr.com",
        "waitUntil": "load"
      }
    },
    {
      "action": "evaluate",
      "argument": {
        "script": "(async () => { const res = await fetch('https://gateway.36kr.com/api/mis/nav/home/nav/v2', { credentials: 'include' }); const d = await res.json(); return (d?.data?.hotNewsList || []).map(item => ({ title: item.title, url: item.url })); })()"
      }
    }
  ],
  "api_endpoint": "36kr-hot",
  "category": "scrape",
  "description": "36氪热榜",
  "is_public": true,
  "method": "GET",
  "name": "Hot",
  "variables": [
    {
      "name": "limit",
      "type": "int",
      "default": 20
    }
  ],
  "website_domain": "36kr.com",
  "website_id": "website-36kr.com"
}
```

### Step 5: Test Generated JSON (Required)

**所有 JSON 文件必须生成测试日志**，验证转换结果正确：

```bash
# 基本测试
npm run test -- ./clis/36kr/hot.json

# 带参数测试 - 用等号连接避免 shell 解析问题
npm run test -- ./clis/zhihu/search.json --params='{"query":"AI","limit":5}'
```

测试完成后会生成 `.test` 日志文件：
- `clis/36kr/hot.json` → `clis/36kr/hot.test`
- 日志中包含 `comparison.match` 字段，确认与 OpenCLI 结果一致

**如果测试失败**：
1. 检查 `evaluate` script 是否使用 `async (intermediate) => {}` 模式
2. 检查 `{{ xxx }}` 模板是否正确替换
3. 检查 API 是否需要 WBI 签名或其他认证
4. 调整脚本后重新测试直到 `match: true`

---

## Test Generated JSON

测试生成的 JSON 文件并对比 OpenCLI 结果（默认启用对比）：

```bash
cd skills/grease-api-builder
npm install

# 测试单个文件（默认对比）- 注意 npm run test 必须加 -- 分隔参数
npm run test -- ./clis/36kr/hot.json

# 带参数测试 - 参数用等号连接避免空格问题
npm run test -- ./clis/zhihu/search.json --params='{"query":"AI","limit":5}'
```

> **重要**: npm 脚本参数传递必须使用 `--` 分隔符，参数格式用 `--params='...'` (等号连接，避免 shell 空格解析问题)

> **注意**: 默认启用 OpenCLI 对比验证结果准确性。**非必要不要使用 `--no-compare`**，仅在以下情况使用：
> - `clis/local/` 目录下的本地私有命令（OpenCLI 中不存在）
> - OpenCLI 命令尚未实现或不可用

### Test Script Options

```bash
npm run test -- <json-file> [options]

Options:
  --cdp <url>       CDP URL (default: http://localhost:9222)
  --params <json>   Parameters as JSON string (支持 --params='...' 或 --params '...')
  --no-compare      禁用 OpenCLI 对比 (仅在 local 命令等特殊情况使用)
  --site <name>     手动指定 OpenCLI 命令名 (默认从 domain 自动提取)
```

### Test Log Output

每次测试完成后，会在 JSON 文件同目录下生成 `.test` 日志文件：

```
clis/bilibili/hot.json    → clis/bilibili/hot.test
clis/zhihu/search.json    → clis/zhihu/search.test
```

日志文件格式：

```json
{
  "timestamp": "2026-04-10T13:20:45.123Z",
  "json_file": "./clis/bilibili/hot.json",
  "command": "Hot",
  "website": "www.bilibili.com",
  "params": { "limit": 20 },
  "success": true,
  "actions": [
    { "action": "open", "status": "succeeded" },
    { "action": "evaluate", "status": "succeeded" }
  ],
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

1. **Chrome with remote debugging**:
   ```bash
   chrome --remote-debugging-port=9222
   ```

2. **LLM API Key** (required by automator):
   ```bash
   export DOUBAO_API_KEY=your_key
   # or
   export OPENAI_API_KEY=your_key
   ```

3. **Automator package**:
   ```bash
   npm install
   ```

4. **OpenCLI** (for comparison):
   ```bash
   npm install -g @jackwener/opencli
   ```

---

## Element Locator (单步调试定位元素)

使用 `scripts/locate-element.ts` 可以单步调试 API JSON，重新定位每个步骤的元素并获取精确的 selectors。

### 使用方法

```bash
npx tsx scripts/locate-element.ts <json文件> <暂停步骤索引> [新target描述]
```

**参数说明**：
- `<json文件>` - 目标 API 的 JSON 文件路径（从中提取前置步骤）
- `<暂停步骤索引>` - 在第几步暂停并重新定位（从 0 开始）
- `[新target描述]` - 可选，使用新的描述重新定位

### 示例

```bash
# 定位 group-create.json 第3步的元素（管理按钮）
npx tsx scripts/locate-element.ts clis/weibo/group-create.json 3

# 用新的描述定位第5步（新建分组按钮）
npx tsx scripts/locate-element.ts clis/weibo/group-create.json 5 "新建分组按钮"
```

### 输出结果

脚本会输出定位到的 selectors 信息，格式如下：

```
Valid selectors for "自定义分组旁边的管理按钮": 
  button.woo-button-main.woo-button-primary
  button.woo-button-main:has(span.woo-button-content)
  div.woo-panel-main button.woo-button-main
```

将这些 selectors 更新到对应 JSON 文件的 actions 中。

### 工作流程

1. 脚本读取 JSON 文件中的 actions
2. 执行暂停步骤之前的所有前置步骤（使用已有的 selectors）
3. 在暂停步骤处重新定位元素（让 LLM 生成新的 selectors）
4. 输出定位结果

---

## Files

| File | Description |
|------|-------------|
| `SKILL.md` | This documentation |
| `test.ts` | Test script with OpenCLI comparison |
| `package.json` | Dependencies (automator@1b2f456) |
| `tsconfig.json` | TypeScript configuration |
| `clis/` | Output directory (mirrors OpenCLI clis structure) |

### Test Requirements (Mandatory)

**转换后必须测试**：
- 每个 JSON 文件必须有对应的 `.test` 日志文件
- 测试日志必须显示 `comparison.match: true`
- 如果测试不通过，必须修复 JSON 文件

**提交前检查**：
```bash
# 确认所有 JSON 都有 .test 文件
ls clis/bilibili/*.json | wc -l
ls clis/bilibili/*.test | wc -l
# 数量应相等

# 检查测试结果
grep -l '"match": true' clis/bilibili/*.test | wc -l
# 应等于 JSON 文件数量
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No fetch URL in evaluate | Command uses UI strategy, generate click/input actions |
| Complex evaluate code | Extract fetch call, simplify script |
| Template mismatch | Replace `${{ args.xxx }}` with `{{ xxx }}` |
| Multiple API calls | Chain evaluate actions |
| networkidle timeout | Change waitUntil to `load` |
| API returns -403 | Check if API needs different auth or use simpler endpoint |
| StagehandEvalError | Convert IIFE to `async (intermediate) => {}` pattern |

---

## Twitter/X API Rate Limits

**Twitter GraphQL API has strict rate limits on API calls.** When testing twitter commands:

- **Space tests at least 30 seconds apart** between each command test
- **API-based read commands** (tweets, timeline, profile, following, lists, bookmark-folders, bookmark-folder, list-tweets, bookmarks, likes, article, search) make GraphQL calls that count against the rate limit
- **DOM-based read commands** (trending, followers, download) are less rate-limited but still require a logged-in session
- **Write/Interact commands** (follow, unfollow, block, unblock, retweet, unretweet, like, unlike, bookmark, unbookmark, post, reply, quote, delete, hide-reply, reply-dm, accept, list-add, list-remove) modify state and should be tested with caution — prefer read commands for validation
- **Test with `--limit 3` or `--limit 5`** to minimize API payload size
- **If you get HTTP 429 errors**, wait 5-15 minutes before continuing
- **Account credentials**: Tests require Chrome with an active x.com login session (ct0 cookie)