import type { WebSocket } from 'ws';
import { encode, type Message } from '../shared/protocol.js';
import { AgentRegistry } from './registry.js';

export class MessageRouter {
  constructor(private registry: AgentRegistry) {}

  send(agentId: string, msg: Omit<Message, 'timestamp'>): void {
    const agent = this.registry.get(agentId);
    if (!agent) return;
    if (agent.ws.readyState !== 1 /* OPEN */) return;
    try {
      agent.ws.send(encode(msg));
    } catch {
      // socket closed mid-send — registry will prune it on next heartbeat check
    }
  }

  broadcast(msg: Omit<Message, 'timestamp'>, exceptAgentId?: string): void {
    for (const agent of this.registry.getAll()) {
      if (agent.id === exceptAgentId) continue;
      if (agent.ws.readyState !== 1) continue;
      try {
        agent.ws.send(encode(msg));
      } catch {
        // ignore closed sockets
      }
    }
  }
}
