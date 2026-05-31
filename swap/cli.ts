#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SERVER_PORT } from './shared/constants.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.basename(ROOT) === 'dist' ? path.dirname(ROOT) : ROOT;

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);
  if (command === 'install') {
    installHooks(process.cwd());
    return;
  }
  if (command === 'start') {
    await startAgent(arg ?? '1');
    return;
  }
  usage();
}

function installHooks(projectDir: string): void {
  const claudeDir = path.join(projectDir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  fs.mkdirSync(claudeDir, { recursive: true });

  const settings = readJson(settingsPath);
  settings.hooks = mergeHookSettings(settings.hooks ?? {});
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  console.log(`Installed SWAP hooks in ${settingsPath}`);
}

async function startAgent(id: string): Promise<void> {
  const worktree = process.env.SWAP_WORKTREE_PATH ?? process.cwd();
  installHooks(worktree);

  const configPath = writeMcpConfig(id, worktree);
  const child = spawn('claude', [
    '--dangerously-skip-permissions',
    '--mcp-config', configPath,
    '--add-dir', worktree,
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SWAP_AGENT_ID: `Agent-${id}`,
      SWAP_AGENT_TASK: process.env.SWAP_AGENT_TASK ?? `Agent ${id} task`,
      SWAP_WORKTREE_PATH: worktree,
      SWAP_SERVER_URL: process.env.SWAP_SERVER_URL ?? `ws://localhost:${SERVER_PORT}`,
    },
  });

  await new Promise<void>((resolve) => {
    child.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}

function mergeHookSettings(existing: unknown): Record<string, unknown> {
  const hooks = typeof existing === 'object' && existing !== null ? existing as Record<string, unknown> : {};
  return {
    ...hooks,
    PreToolUse: mergeEventHooks(hooks.PreToolUse, 'pre'),
    PostToolUse: mergeEventHooks(hooks.PostToolUse, 'post'),
  };
}

function mergeEventHooks(existing: unknown, phase: 'pre' | 'post'): unknown[] {
  const entries = Array.isArray(existing) ? existing : [];
  const command = hookCommand(phase);
  const withoutSwap = entries.filter((entry) => JSON.stringify(entry).includes(command) === false);
  return [
    ...withoutSwap,
    {
      matcher: 'Edit|Write|MultiEdit',
      hooks: [{ type: 'command', command }],
    },
  ];
}

function hookCommand(phase: 'pre' | 'post'): string {
  return `node --loader ts-node/esm ${path.join(SOURCE_ROOT, 'hooks', 'cli.ts')} ${phase}`;
}

function writeMcpConfig(id: string, worktree: string): string {
  const configDir = path.join(os.tmpdir(), 'swap-mcp-configs');
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, `agent-${id}.json`);
  const config = {
    mcpServers: {
      swap: {
        command: 'node',
        args: ['--loader', 'ts-node/esm', path.join(SOURCE_ROOT, 'mcp', 'server.ts')],
        env: {
          SWAP_SERVER_URL: process.env.SWAP_SERVER_URL ?? `ws://localhost:${SERVER_PORT}`,
          SWAP_AGENT_ID: `Agent-${id}`,
          SWAP_AGENT_TASK: process.env.SWAP_AGENT_TASK ?? `Agent ${id} task`,
          SWAP_WORKTREE_PATH: worktree,
        },
      },
    },
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return configPath;
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function usage(): void {
  console.log('Usage: swap install | swap start <id>');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
