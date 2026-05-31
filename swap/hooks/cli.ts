#!/usr/bin/env node
import { runPostHook } from './post.js';
import { runPreHook } from './pre.js';
import type { HookEvent } from './resolve.js';

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'pre' && command !== 'post') {
    console.error('Usage: swap-hook <pre|post>');
    process.exit(1);
  }

  const event = await readHookEvent();
  if (command === 'pre') {
    await runPreHook(event);
  } else {
    await runPostHook(event);
  }
}

async function readHookEvent(): Promise<HookEvent> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw new Error('Expected Claude Code hook event JSON on stdin');
  return JSON.parse(raw) as HookEvent;
}

main().catch((error) => {
  // Hooks fail open: an internal SWAP hook failure must not brick the agent.
  console.error(`SWAP hook warning: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(0);
});
