#!/usr/bin/env npx tsx
/**
 * Agent Validator — validates a Grease Agent project structure and content.
 *
 * Usage:
 *   npx tsx scripts/validate-agent.ts <agent-dir>
 *   npx tsx scripts/validate-agent.ts ./samples/UaufS6duSA7NIuMTzeuT6_v8
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

// --- Result types ---

type Level = 'error' | 'warn' | 'info';

type CheckResult = {
  level: Level;
  message: string;
};

// --- Helpers ---

function fileExists(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function dirExists(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function readText(path: string): string | null {
  if (!fileExists(path)) return null;
  return readFileSync(path, 'utf-8');
}

function readJson<T = unknown>(path: string): T | null {
  const text = readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function result(level: Level, message: string): CheckResult {
  return { level, message };
}

function error(message: string): CheckResult {
  return result('error', message);
}

function warn(message: string): CheckResult {
  return result('warn', message);
}

function info(message: string): CheckResult {
  return result('info', message);
}

// --- Validators ---

const REQUIRED_MD_FILES = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'TOOLS.md', 'USER.md'];

function validateMdFiles(filesDir: string): CheckResult[] {
  const results: CheckResult[] = [];

  for (const mdFile of REQUIRED_MD_FILES) {
    const path = join(filesDir, mdFile);
    if (!fileExists(path)) {
      results.push(error(`Missing required file: ${mdFile}`));
      continue;
    }

    const content = readText(path)!;
    const name = mdFile.replace('.md', '');

    // Check non-empty
    if (content.trim().length === 0) {
      results.push(error(`${mdFile} is empty`));
      continue;
    }

    // Check has a heading matching the file name
    const hasHeading = content.split('\n').some(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('# ') && trimmed.toLowerCase().includes(name.toLowerCase());
    });
    if (!hasHeading) {
      results.push(warn(`${mdFile} has no top-level heading containing "${name}"`));
    }

    // Specific format checks per file
    if (mdFile === 'IDENTITY.md') {
      if (!content.includes('**Name')) {
        results.push(warn('IDENTITY.md missing "**Name**" field'));
      }
    }

    if (mdFile === 'SOUL.md') {
      const hasBoundaries = /##\s*Boundar/i.test(content);
      if (!hasBoundaries) {
        results.push(warn('SOUL.md missing "## Boundaries" section'));
      }
    }

    if (mdFile === 'AGENTS.md') {
      const hasEverySession = /##\s*Every\s*Session/i.test(content);
      if (!hasEverySession) {
        results.push(warn('AGENTS.md missing "## Every Session" section'));
      }
    }

    results.push(info(`${mdFile} OK`));
  }

  return results;
}

function validateAgentJson(agentDir: string): CheckResult[] {
  const results: CheckResult[] = [];
  const path = join(agentDir, 'agent.json');

  if (!fileExists(path)) {
    results.push(error('Missing agent.json'));
    return results;
  }

  const data = readJson<any>(path);
  if (data === null) {
    results.push(error('agent.json is not valid JSON'));
    return results;
  }

  // Check top-level structure
  if (!data.formatVersion) {
    results.push(warn('agent.json missing "formatVersion"'));
  }
  if (!data.agent) {
    results.push(error('agent.json missing "agent" object'));
    return results;
  }

  const agent = data.agent;

  // Required agent fields
  if (!agent.name) {
    results.push(error('agent.json missing "agent.name"'));
  }
  if (!Array.isArray(agent.apiDependencies)) {
    results.push(warn('agent.json missing "agent.apiDependencies" (should be an array)'));
  }

  // Check files array
  if (!Array.isArray(data.files)) {
    results.push(warn('agent.json missing "files" array'));
  } else {
    const fileNames = new Set(data.files.map((f: any) => f.name));
    for (const md of REQUIRED_MD_FILES) {
      if (!fileNames.has(md)) {
        results.push(warn(`agent.json "files" does not include "${md}"`));
      }
    }
  }

  results.push(info('agent.json OK'));
  return results;
}

function validateApiSync(filesDir: string): CheckResult[] {
  const results: CheckResult[] = [];
  const apisDir = join(filesDir, 'apis');
  const apiTsPath = join(filesDir, 'workflows', 'src', 'api.ts');

  // Collect API endpoints from apis/ directory
  // File path: apis/{domain}/{command}.json → function name: {command} with - → _
  // e.g. apis/x.com/twitter-search.json → twitter_search
  const apiEndpoints = new Map<string, string>(); // command name → domain
  if (dirExists(apisDir)) {
    const domains = readdirSync(apisDir);
    for (const domain of domains) {
      const domainDir = join(apisDir, domain);
      if (!statSync(domainDir).isDirectory()) continue;
      for (const file of readdirSync(domainDir)) {
        if (!file.endsWith('.json')) continue;
        const command = file.replace('.json', '');
        const funcName = command.replace(/-/g, '_');
        apiEndpoints.set(funcName, domain);
      }
    }
  }

  if (apiEndpoints.size === 0) {
    results.push(info('No API files found in apis/ directory'));
    return results;
  }

  // Parse api.ts for function names
  const apiTsContent = readText(apiTsPath);
  if (apiTsContent === null) {
    results.push(warn('workflows/src/api.ts not found — cannot verify API sync'));
    return results;
  }

  // Extract function names from api.ts (pattern: async <name>( or <name>(
  const funcMatches = apiTsContent.matchAll(/(?:async\s+)?(\w+)\s*\(/g);
  const funcNames = new Set<string>();
  for (const m of funcMatches) {
    const name = m[1];
    // Skip common non-API names
    if (['createWorkflowApis', 'if', 'switch', 'for', 'while', 'catch', 'return', 'const', 'let', 'var', 'new', 'typeof', 'async'].includes(name)) continue;
    funcNames.add(name);
  }

  // Check each API endpoint has a corresponding function
  for (const [funcName, domain] of apiEndpoints) {
    const camelName = funcName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

    if (!funcNames.has(funcName) && !funcNames.has(camelName)) {
      results.push(error(`API "${funcName}" (domain: ${domain}) exists in apis/ but no matching function in api.ts (tried ${funcName}, ${camelName})`));
    }
  }

  // Check api.ts functions that have no corresponding API file
  for (const funcName of funcNames) {
    const possibleEndpoints = [
      funcName,
      funcName.replace(/_/g, '-'),
    ];
    const hasMatch = possibleEndpoints.some(e => apiEndpoints.has(e));
    if (!hasMatch && (funcName.includes('_') || funcName.includes('-'))) {
      // Only warn for snake_case or kebab-case names that look like API endpoints
      results.push(warn(`Function "${funcName}" in api.ts has no matching API file in apis/`));
    }
  }

  results.push(info(`API sync check: ${apiEndpoints.size} endpoint(s) in apis/, ${funcNames.size} function(s) in api.ts`));
  return results;
}

function validateWorkflowHeaders(filesDir: string): CheckResult[] {
  const results: CheckResult[] = [];
  const distWorkflowsDir = join(filesDir, 'workflows', 'dist', 'workflows');

  if (!dirExists(distWorkflowsDir)) {
    results.push(warn('workflows/dist/workflows/ not found — run "pnpm run build" first'));
    return results;
  }

  const jsFiles = readdirSync(distWorkflowsDir).filter(f => f.endsWith('.js'));
  if (jsFiles.length === 0) {
    results.push(warn('No workflow JS files found in dist/workflows/'));
    return results;
  }

  const requiredFields = ['name', 'description'];
  const validFields = new Set(['name', 'description', 'use when', 'cron', 'input', 'output']);

  for (const jsFile of jsFiles) {
    const path = join(distWorkflowsDir, jsFile);
    const content = readText(path)!;

    // Extract YAML frontmatter from JS comment block
    // Pattern: /**\n * ---\n * <yaml content>\n * ---\n */
    const frontmatterMatch = content.match(/\/\*\*\s*\n\s*\*\s*---\s*\n([\s\S]*?)\s*\*\s*---/);
    if (!frontmatterMatch) {
      results.push(error(`${jsFile}: No valid workflow frontmatter found (expected /**\\n * ---\\n * ...\\n * ---\\n */)`));
      continue;
    }

    // Parse the YAML-like content from comment lines
    const yamlLines = frontmatterMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, ''))
      .filter(line => line.trim().length > 0);

    const parsed: Record<string, any> = {};
    let currentKey = '';

    for (const line of yamlLines) {
      const keyMatch = line.match(/^([\w\s]+?):\s*(.*)/);
      if (keyMatch) {
        currentKey = keyMatch[1].trim();
        const value = keyMatch[2].trim();
        if (value) {
          parsed[currentKey] = value;
        } else {
          parsed[currentKey] = [];
        }
      } else if (currentKey && line.trim().startsWith('-')) {
        if (Array.isArray(parsed[currentKey])) {
          parsed[currentKey].push(line.trim().replace(/^-\s*/, ''));
        }
      }
    }

    // Validate required fields
    for (const field of requiredFields) {
      if (!parsed[field]) {
        results.push(error(`${jsFile}: Missing required frontmatter field "${field}"`));
      }
    }

    // Check for unknown top-level fields
    for (const key of Object.keys(parsed)) {
      if (!validFields.has(key)) {
        results.push(warn(`${jsFile}: Unknown frontmatter field "${key}"`));
      }
    }

    // Validate input format if present
    if (parsed.input && Array.isArray(parsed.input)) {
      for (const inputItem of parsed.input) {
        if (typeof inputItem === 'string') {
          const hasName = inputItem.includes('name:');
          if (!hasName) {
            results.push(warn(`${jsFile}: Input item missing "name" field: ${inputItem}`));
          }
        }
      }
    }

    // Validate cron format if present
    if (parsed.cron && Array.isArray(parsed.cron)) {
      for (const cronExpr of parsed.cron) {
        if (typeof cronExpr === 'string') {
          const parts = cronExpr.replace(/\\/, '').split(/\s+/);
          if (parts.length < 5 || parts.length > 6) {
            results.push(warn(`${jsFile}: Invalid cron expression: "${cronExpr}" (expected 5-6 fields)`));
          }
        }
      }
    }

    results.push(info(`${jsFile}: frontmatter OK (name: "${parsed.name || 'N/A'}")`));
  }

  return results;
}

// --- Main ---

function validateAgent(agentDir: string): void {
  const agentName = basename(agentDir);
  const filesDir = join(agentDir, 'files');

  console.log(`\nValidating agent: ${agentName}`);
  console.log('='.repeat(50));

  let errorCount = 0;
  let warnCount = 0;
  let infoCount = 0;

  function printResults(results: CheckResult[]) {
    for (const r of results) {
      const icon = r.level === 'error' ? '✗' : r.level === 'warn' ? '⚠' : '✓';
      const color = r.level === 'error' ? '\x1b[31m' : r.level === 'warn' ? '\x1b[33m' : '\x1b[32m';
      console.log(`  ${color}${icon}\x1b[0m ${r.message}`);
      if (r.level === 'error') errorCount++;
      else if (r.level === 'warn') warnCount++;
      else infoCount++;
    }
  }

  // 1. Validate MD files
  console.log('\n📋 Markdown Files');
  printResults(validateMdFiles(filesDir));

  // 2. Validate agent.json
  console.log('\n📦 agent.json');
  printResults(validateAgentJson(agentDir));

  // 3. Validate API sync
  console.log('\n🔗 API Sync (apis/ ↔ api.ts)');
  printResults(validateApiSync(filesDir));

  // 4. Validate workflow headers
  console.log('\n⚙️  Workflow Headers (dist/workflows/)');
  printResults(validateWorkflowHeaders(filesDir));

  // Summary
  console.log('\n' + '='.repeat(50));
  if (errorCount > 0) {
    console.log(`\x1b[31m✗ ${errorCount} error(s), ${warnCount} warning(s), ${infoCount} passed\x1b[0m`);
    process.exit(1);
  } else if (warnCount > 0) {
    console.log(`\x1b[33m⚠ ${warnCount} warning(s), ${infoCount} passed\x1b[0m`);
  } else {
    console.log(`\x1b[32m✓ All checks passed (${infoCount})\x1b[0m`);
  }
}

// --- CLI ---

const agentDir = process.argv[2];
if (!agentDir) {
  console.error('Usage: npx tsx scripts/validate-agent.ts <agent-dir>');
  console.error('Example: npx tsx scripts/validate-agent.ts ./samples/UaufS6duSA7NIuMTzeuT6_v8');
  process.exit(1);
}

const resolvedDir = agentDir.startsWith('/') ? agentDir : join(process.cwd(), agentDir);
if (!dirExists(resolvedDir)) {
  console.error(`Directory not found: ${resolvedDir}`);
  process.exit(1);
}

validateAgent(resolvedDir);
