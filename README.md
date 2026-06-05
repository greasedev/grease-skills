# Grease Skills

Grease 平台上的开发技能集合，用于构建和发布 Agent 应用。

## 能力概览

### grease-api-builder

构建浏览器自动化 API（GreaseApi JSON）。生成的 API 定义可在 Agent 中直接调用。

- 定义浏览器操作流程（打开页面、输入、点击、提取数据等）
- 支持 track（网络拦截）、loop（循环执行）等高级动作
- 内置测试和元素定位工具

### grease-agent-builder

构建 Grease Agent 项目。Agent 是一个具备身份、记忆、工作流和交互页面的智能应用。

- **身份与行为** — 通过 MD 文件定义 Agent 人格、行为准则和用户画像
- **工作流（Workflow）** — 自动化任务，支持定时触发（cron）和参数输入
- **页面（Page）** — Agent 内嵌的交互式 HTML 视图，支持实时数据展示和操作
- **持久化存储** — 基于 Dexie（IndexedDB）的本地数据库
- **AI 能力** — 通过 `agent.complete()` 调用 LLM，支持 JSON Schema 结构化输出
- **API 调用** — 通过 auto-generated API Client 调用 grease-api-builder 构建的浏览器自动化接口
- **定时调度** — 内置 Scheduler 管理 cron 任务

## 开发流程

利用本项目的 skill 完成开发，最终将 Agent 整体打包后安装到 Grease Dev Center：

```
1. 创建 Agent
   └─ 使用 grease-agent-builder skill 生成 Agent 项目结构和 MD 文件

2. 构建 API
   └─ 使用 grease-api-builder skill 编写 GreaseApi JSON
   └─ 在本地测试和验证 API 定义

3. 开发工作流和页面
   └─ 使用 grease-agent-builder skill 编写 workflow / page
   └─ pnpm install 安装依赖
   └─ pnpm run test:workflow:* 测试工作流
   └─ pnpm run dev:pages 测试页面

4. 打包
   └─ pnpm run build 编译为 dist/
   └─ 使用 validate-agent.ts 校验 Agent 完整性
   └─ 将 Agent 整体打包（包含 MD 文件、apis、workflows 等）

5. 安装、运行、发布
   └─ 在 Dev Center 中安装打包后的 Agent
   └─ 在 Dev Center 中运行和调试
   └─ 在 Dev Center 中发布上线
```

## 目录结构

```
grease-skills/
├── grease-api-builder/       # API 构建技能
│   ├── SKILL.md              # 使用文档
│   ├── clis/                 # API 定义输出
│   └── scripts/              # 测试和工具脚本
├── grease-agent-builder/     # Agent 构建技能
│   ├── SKILL.md              # 使用文档
│   └── samples/              # Agent 样例项目
└── README.md
```
