/**
 * Track Script Sample Parser Test
 *
 * Tests whether the track action script in a GreaseApi JSON file
 * can correctly parse a corresponding .sample file.
 *
 * Usage:
 *   npx tsx scripts/test-track.ts <json-file>
 *
 * The script looks for a .sample file next to the .json file
 * (e.g. clis/taobao/search.json → clis/taobao/search.sample)
 *
 * It extracts the track action's script, feeds the sample content
 * as globalVars.response.body, and validates the output against
 * the JSON's output_schema.
 */

import fs from "node:fs";
import { resolve } from "node:path";

interface GreaseAction {
	action: string;
	argument: Record<string, unknown>;
}

interface OutputSchemaField {
	name: string;
	type: string;
	description: string;
}

interface GreaseJson {
	actions: GreaseAction[];
	output_schema?: OutputSchemaField[];
	variables?: Array<{
		name: string;
		type?: string;
		default?: unknown;
		test?: unknown;
	}>;
	name: string;
	description: string;
}

function findTrackAction(json: GreaseJson): GreaseAction | undefined {
	return json.actions.find((a) => a.action === "track");
}

function findSampleFile(jsonFile: string): string | undefined {
	const sampleFile = jsonFile.replace(/\.json$/, ".sample");
	if (fs.existsSync(sampleFile)) return sampleFile;
	return undefined;
}

function resolveTemplateVars(
	script: string,
	variables: GreaseJson["variables"],
): string {
	if (!variables) return script;
	let resolved = script;
	for (const v of variables) {
		const value = v.test !== undefined ? v.test : v.default;
		if (value !== undefined) {
			resolved = resolved.replace(
				new RegExp(`\\{\\{\\s*${v.name}\\s*\\}\\}`, "g"),
				String(value),
			);
		}
	}
	return resolved;
}

function validateOutput(
	results: unknown[],
	schema: OutputSchemaField[],
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!Array.isArray(results)) {
		return { valid: false, errors: ["Track script did not return an array"] };
	}

	if (results.length === 0) {
		return { valid: false, errors: ["Track script returned empty array"] };
	}

	const typeChecks: Record<string, (v: unknown) => boolean> = {
		string: (v) => typeof v === "string",
		number: (v) => typeof v === "number",
		boolean: (v) => typeof v === "boolean",
		int: (v) => Number.isInteger(v),
	};

	for (let i = 0; i < results.length; i++) {
		const item = results[i] as Record<string, unknown>;
		if (!item || typeof item !== "object") {
			errors.push(`Item ${i}: not an object`);
			continue;
		}

		for (const field of schema) {
			if (!(field.name in item)) {
				errors.push(`Item ${i}: missing field "${field.name}"`);
				continue;
			}

			const val = item[field.name];
			const check = typeChecks[field.type];
			if (check && !check(val)) {
				errors.push(
					`Item ${i}.${field.name}: expected ${field.type}, got ${typeof val} (${JSON.stringify(val)?.slice(0, 50)})`,
				);
			}
		}
	}

	return { valid: errors.length === 0, errors };
}

async function main() {
	const args = process.argv.slice(2);
	const jsonFile = args[0];

	if (!jsonFile || args.includes("--help")) {
		console.log(`
Track Script Sample Parser Test

Tests whether the track action script can correctly parse a .sample file.

Usage:
  npx tsx scripts/test-track.ts <json-file>

The .sample file is auto-detected next to the .json file.
(e.g. clis/taobao/search.json → clis/taobao/search.sample)
`);
		process.exit(jsonFile ? 0 : 1);
	}

	const resolvedPath = resolve(jsonFile);

	// Load JSON
	if (!fs.existsSync(resolvedPath)) {
		console.error(`File not found: ${resolvedPath}`);
		process.exit(1);
	}

	const json: GreaseJson = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));

	// Find track action
	const trackAction = findTrackAction(json);
	if (!trackAction) {
		console.error(`No track action found in ${jsonFile}`);
		process.exit(1);
	}

	const script = trackAction.argument.script as string;
	if (!script) {
		console.error("Track action has no script");
		process.exit(1);
	}

	// Find sample file
	const sampleFile = findSampleFile(resolvedPath);
	if (!sampleFile) {
		console.error(
			`No .sample file found for ${jsonFile}\nExpected: ${resolvedPath.replace(/\.json$/, ".sample")}`,
		);
		process.exit(1);
	}

	const sampleBody = fs.readFileSync(sampleFile, "utf-8");

	console.log("Track Script Sample Test");
	console.log("========================\n");
	console.log(`JSON:     ${jsonFile}`);
	console.log(`Sample:   ${sampleFile}`);
	console.log(`Command:  ${json.name}`);
	console.log(`Sample size: ${(sampleBody.length / 1024).toFixed(1)} KB`);

	// Resolve template variables in script
	const resolvedScript = resolveTemplateVars(script, json.variables);

	// Execute track script with sample data
	console.log("\nRunning track script against sample...\n");

	let results: unknown[];
	try {
		const fn = new Function(
			"globalVars",
			`return (${resolvedScript})(globalVars)`,
		);
		const globalVars = { response: { body: sampleBody }, extractData: [] };
		results = await fn(globalVars);
	} catch (err) {
		console.error(
			`Script execution error: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	}

	// Print results
	const count = Array.isArray(results) ? results.length : 0;
	console.log(`Results: ${count} items`);

	if (count > 0) {
		console.log("\nFirst 3 items:");
		for (const item of results.slice(0, 3)) {
			console.log(JSON.stringify(item, null, 2));
		}

		if (count > 3) {
			console.log(`\n... and ${count - 3} more`);
		}
	}

	// Validate against output_schema
	if (json.output_schema && json.output_schema.length > 0) {
		console.log("\nValidation against output_schema:");
		const { valid, errors } = validateOutput(
			results as unknown[],
			json.output_schema,
		);

		if (valid) {
			console.log(`  All ${count} items match output_schema`);
		} else {
			console.log(`  ${errors.length} validation error(s):`);
			for (const e of errors.slice(0, 10)) {
				console.log(`    - ${e}`);
			}
			if (errors.length > 10) {
				console.log(`    ... and ${errors.length - 10} more`);
			}
		}

		console.log("\n" + "=".repeat(50));
		console.log(valid ? "PASS" : "FAIL");
		console.log("=".repeat(50));
		process.exit(valid ? 0 : 1);
	} else {
		// No schema, just check non-empty
		const pass = count > 0;
		console.log("\n" + "=".repeat(50));
		console.log(pass ? "PASS (no schema, non-empty check)" : "FAIL (empty results)");
		console.log("=".repeat(50));
		process.exit(pass ? 0 : 1);
	}
}

main().catch((err) => {
	console.error(
		`Fatal error: ${err instanceof Error ? err.message : String(err)}`,
	);
	process.exit(1);
});
