import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { encode, decode } from '../shared/protocol.js';
import type { Message } from '../shared/protocol.js';
import { SERVER_PORT, HEARTBEAT_INTERVAL_MS, MAX_EVENT_BUFFER } from '../shared/constants.js';
import {
  ListAgentsSchema,
  BroadcastIntentSchema,
  ClaimSymbolSchema,
  ReleaseSymbolSchema,
  GetPeerContextSchema,
} from './schema.js';

// ── Config from environment ──────────────────────────────────────────────────
const SWAP_SERVER_URL = process.env.SWAP_SERVER_URL ?? `ws://localhost:${SERVER_PORT}`;
const AGENT_TASK = process.env.SWAP_AGENT_TASK ?? 'Unnamed task';
const AGENT_WORKTREE = process.env.SWAP_WORKTREE_PATH ?? process.cwd();

// ── State ────────────────────────────────────────────────────────────────────
let agentId: string | null = null;
let ws: WebSocket;
const eventBuffer: Message[] = [];
const pendingRequests = new Map<string, (msg: Message) => void>();

// ── WebSocket connection ─────────────────────────────────────────────────────
function connect() {
  ws = new WebSocket(SWAP_SERVER_URL);

  ws.on('open', () => {
    // Register with the SWAP server
    ws.send(encode({
      id: uuid(),
      type: 'REGISTER',
      payload: { worktreePath: AGENT_WORKTREE, taskDescription: AGENT_TASK },
    }));
  });

  ws.on('message', (raw) => {
    let msg: Message;
    try {
      msg = decode(raw.toString());
    } catch {
      return;
    }

    // Resolve pending request if this is a direct reply
    if (msg.id && pendingRequests.has(msg.id)) {
      pendingRequests.get(msg.id)!(msg);
      pendingRequests.delete(msg.id);
      return;
    }

    // Capture agent ID on registration
    if (msg.type === 'REGISTERED') {
      agentId = (msg.payload as { agentId: string }).agentId;
      return;
    }

    // Buffer peer events for get_peer_context
    const peerEventTypes = ['PEER_DIFF', 'PEER_INTENT', 'AGENT_JOINED', 'AGENT_LEFT', 'CLAIM_GRANTED', 'CLAIM_CONFLICT', 'DEFER', 'NEGOTIATE_REQUEST'];
    if (peerEventTypes.includes(msg.type)) {
      eventBuffer.unshift(msg);
      if (eventBuffer.length > MAX_EVENT_BUFFER) eventBuffer.pop();
    }
  });

  ws.on('close', () => {
    // Exponential backoff reconnect
    let delay = 1000;
    const retry = () => {
      setTimeout(() => {
        try { connect(); } catch { delay = Math.min(delay * 2, 30_000); retry(); }
      }, delay);
      delay = Math.min(delay * 2, 30_000);
    };
    retry();
  });

  ws.on('error', () => { /* handled by close event */ });
}

// Send a request to SWAP server and await a matching response (by message id)
function request(type: Message['type'], payload: unknown, responseTypes: string[]): Promise<Message> {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`SWAP request ${type} timed out`));
    }, 10_000);

    // Listen for any response of the expected types
    const handler = (msg: Message) => {
      if (responseTypes.includes(msg.type)) {
        clearTimeout(timeout);
        resolve(msg);
      }
    };

    // Override: intercept the next response that matches our expected types
    const wrappedHandler = (raw: Parameters<typeof ws.on>[1] extends (data: infer D) => void ? D : never) => {
      let msg: Message;
      try { msg = decode(raw.toString()); } catch { return; }
      if (responseTypes.includes(msg.type)) {
        ws.removeListener('message', wrappedHandler as never);
        clearTimeout(timeout);
        resolve(msg);
      }
    };

    ws.on('message', wrappedHandler as never);
    ws.send(encode({ id, type, payload }));
  });
}

// ── Heartbeat ────────────────────────────────────────────────────────────────
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(encode({ id: uuid(), type: 'PING', payload: {} }));
  }
}, HEARTBEAT_INTERVAL_MS);

// ── MCP Server ───────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'swap', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_agents',
      description: 'List all agents currently connected to the SWAP coordination server. Call this at the start of your task to understand who else is running and what they are working on.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'broadcast_intent',
      description: 'Announce to all peer agents what you are about to work on. Call this before starting a significant task so peers can adjust their plans if needed.',
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'What you are about to do' },
          filePaths: { type: 'array', items: { type: 'string' }, description: 'Files you expect to touch' },
          estimatedMinutes: { type: 'number', description: 'Estimated time to complete' },
        },
        required: ['description', 'filePaths'],
      },
    },
    {
      name: 'claim_symbol',
      description: 'Claim exclusive access to a named symbol (function, class, etc.) before modifying it. Returns GRANTED or CONFLICT. Always call this before editing a symbol.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'File path relative to worktree root' },
          symbolName: { type: 'string', description: 'Exact name of the symbol' },
          intent: { type: 'string', enum: ['read', 'write', 'refactor', 'delete'] },
          estimatedMinutes: { type: 'number' },
        },
        required: ['filePath', 'symbolName', 'intent'],
      },
    },
    {
      name: 'release_symbol',
      description: 'Release a symbol you previously claimed. Call this after you have finished modifying the symbol.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          symbolName: { type: 'string' },
          newSource: { type: 'string', description: 'Current file source for diff computation' },
        },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'get_peer_context',
      description: 'Get everything peer agents are currently doing and what they have recently changed. Call this periodically to stay updated on the shared codebase state.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'list_agents') {
    const response = await request('LIST_AGENTS', {}, ['AGENT_LIST']);
    const payload = response.payload as { agents: unknown[]; totalActive: number };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }

  if (name === 'broadcast_intent') {
    const parsed = BroadcastIntentSchema.parse(args);
    ws.send(encode({ id: uuid(), type: 'BROADCAST_INTENT', payload: parsed }));
    return {
      content: [{ type: 'text', text: `Intent broadcast to peers: "${parsed.description}"` }],
    };
  }

  if (name === 'claim_symbol') {
    const parsed = ClaimSymbolSchema.parse(args);
    const response = await request('CLAIM', parsed, ['CLAIM_GRANTED', 'CLAIM_CONFLICT']);
    return {
      content: [{ type: 'text', text: JSON.stringify(response.payload, null, 2) }],
    };
  }

  if (name === 'release_symbol') {
    const parsed = ReleaseSymbolSchema.parse(args);
    ws.send(encode({ id: uuid(), type: 'RELEASE', payload: parsed }));
    return {
      content: [{ type: 'text', text: `Released: ${parsed.filePath}::${parsed.symbolName}` }],
    };
  }

  if (name === 'get_peer_context') {
    const response = await request('LIST_AGENTS', {}, ['AGENT_LIST']);
    const agentList = response.payload;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ agents: agentList, recentEvents: eventBuffer.slice(0, 20) }, null, 2),
      }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// ── Start ────────────────────────────────────────────────────────────────────
connect();

const transport = new StdioServerTransport();
await server.connect(transport);
