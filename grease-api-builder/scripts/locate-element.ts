/**
 * 元素定位脚本 - 单步调试 API 并获取 selector
 *
 * 用法: npx tsx scripts/locate-element.ts <json文件> <暂停步骤索引> [新target描述]
 *
 * 说明:
 *   - 从目标API的JSON文件中提取前置步骤
 *   - 运行到指定步骤索引时暂停并重新定位该步骤的元素
 *   - 如果提供新target描述，会用它来重新定位
 *
 * 示例:
 *   # 定位第3步的元素（使用原始target）
 *   npx tsx scripts/locate-element.ts clis/weibo/group-create.json 3
 *
 *   # 定位第3步的元素（使用新的target描述）
 *   npx tsx scripts/locate-element.ts clis/weibo/group-create.json 3 "新建分组按钮"
 */
import "dotenv/config";
import fs from "node:fs";
import {
	type BrowserTask,
	clearDebugTask,
	clearDebugTaskResult,
	type GAction,
	runTask,
	setDebugTask,
} from "grease-driver-layer/driver-layer";

async function locateElement(
	jsonFile: string,
	pauseStep: number,
	newTarget?: string,
) {
	const taskId = "debug-task";

	// 读取目标API的JSON文件
	if (!fs.existsSync(jsonFile)) {
		console.error(`文件不存在: ${jsonFile}`);
		return;
	}

	const content = fs.readFileSync(jsonFile, "utf-8");
	const apiJson = JSON.parse(content);

	if (!apiJson.actions || !Array.isArray(apiJson.actions)) {
		console.error("JSON文件中没有有效的actions数组");
		return;
	}

	const allActions: GAction[] = apiJson.actions;

	if (pauseStep < 0 || pauseStep >= allActions.length) {
		console.error(
			`暂停步骤索引无效: ${pauseStep} (总步骤数: ${allActions.length})`,
		);
		return;
	}

	// 获取暂停步骤的信息
	const pauseAction = allActions[pauseStep];

	// 构建目标动作：清空 selectors，让 AI 重新定位元素
	// 保留 argument.target 描述，但删除已有的 selector 信息
	const targetAction: GAction = {
		action: pauseAction.action,
		argument: newTarget
			? { ...pauseAction.argument, target: newTarget }
			: { ...pauseAction.argument },
		selectors: [], // 清空 selectors，强制 AI 重新定位
	};

	// 删除可能存在的 xpath，避免影响定位
	if ("xpath" in targetAction) {
		delete (targetAction as unknown as Record<string, unknown>).xpath;
	}

	// 构建前置步骤（运行到暂停步骤之前）
	const preSteps = allActions.slice(0, pauseStep);

	// 完整的actions：前置步骤 + 重新定位的步骤
	const actions: GAction[] = [...preSteps, targetAction];

	const task: BrowserTask = {
		_id: taskId,
		screenshot_type: "none",
		status: "waiting",
		user_id: "debug-user",
		params:
			apiJson.variables?.reduce(
				(
					acc: Record<string, unknown>,
					v: { name: string; test?: unknown; default?: unknown },
				) => {
					if (v.test !== undefined) acc[v.name] = v.test;
					else if (v.default !== undefined) acc[v.name] = v.default;
					return acc;
				},
				{},
			) || {},
		browser_instance_id: "dev-browser-config",
		browser_instance_info: {
			browser_config_id: "dev-browser-config",
		},
		browser_operation: {
			name: apiJson.name || "LocateElement",
			actions,
		},
	};

	setDebugTask(task);

	console.log(`\n========================================`);
	console.log(`API: ${apiJson.name || jsonFile}`);
	console.log(`暂停步骤: 第${pauseStep}步 (共${allActions.length}步)`);
	console.log(`步骤类型: ${pauseAction.action}`);
	console.log(
		`原始target: ${(pauseAction.argument as Record<string, unknown>).target || "N/A"}`,
	);
	if (newTarget) {
		console.log(`新target: ${newTarget}`);
	}
	console.log(`========================================\n`);

	console.log(`前置步骤 (${preSteps.length}步):`);
	preSteps.forEach((a, i) => {
		console.log(`  ${i}: ${a.action}`);
	});
	console.log(`  ${pauseStep}: ${pauseAction.action} <- 定位此步骤\n`);

	try {
		await runTask(taskId);
		console.log("\n========================================");
		console.log("任务完成 - 请查看上方日志中的 selector 信息");
		console.log("========================================");
	} catch (err) {
		console.error(
			"定位失败:",
			err instanceof Error ? err.message : String(err),
		);
	}

	clearDebugTask();
	clearDebugTaskResult();
}

// 从命令行参数获取
const jsonFile = process.argv[2];
const pauseStep = parseInt(process.argv[3] || "0", 10);
const newTarget = process.argv[4];

if (!jsonFile) {
	console.log(
		"用法: npx tsx scripts/locate-element.ts <json文件> <暂停步骤索引> [新target描述]",
	);
	console.log(
		"示例: npx tsx scripts/locate-element.ts clis/weibo/group-create.json 3",
	);
	process.exit(1);
}

locateElement(jsonFile, pauseStep, newTarget);
