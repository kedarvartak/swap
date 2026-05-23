import { z } from 'zod';

export const ListAgentsSchema = z.object({});

export const BroadcastIntentSchema = z.object({
  description: z.string().min(1).describe('What you are about to do'),
  filePaths: z.array(z.string()).describe('Files you expect to touch'),
  estimatedMinutes: z.number().optional().describe('How long you expect this to take'),
});

export const ClaimSymbolSchema = z.object({
  filePath: z.string().describe('File path relative to worktree root'),
  symbolName: z.string().describe('Exact symbol name as it appears in code'),
  intent: z.enum(['read', 'write', 'refactor', 'delete']).describe('What you intend to do'),
  estimatedMinutes: z.number().optional().describe('Estimated time to release'),
});

export const ReleaseSymbolSchema = z.object({
  filePath: z.string(),
  symbolName: z.string(),
  newSource: z.string().optional().describe('Current file source, used to compute semantic diff'),
});

export const GetPeerContextSchema = z.object({});
