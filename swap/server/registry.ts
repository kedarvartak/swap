import type { WebSocket } from 'ws';
import type { AgentRecord, AgentStatus, SymbolClaim, SemanticDiff } from '../shared/types.js';
import { HEARTBEAT_TIMEOUT_MS, MAX_RECENT_DIFFS } from '../shared/constants.js';

interface LiveAgent extends AgentRecord {
  ws: WebSocket;
}

export class AgentRegistry {
  private agents = new Map<string, LiveAgent>();

  add(agent: LiveAgent): void {
    this.agents.set(agent.id, agent);
  }

  remove(agentId: string): void {
    this.agents.delete(agentId);
  }

  get(agentId: string): LiveAgent | undefined {
    return this.agents.get(agentId);
  }

  getAll(): LiveAgent[] {
    return Array.from(this.agents.values());
  }

  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  updateHeartbeat(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.lastHeartbeat = Date.now();
  }

  updateStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.status = status;
  }

  addClaim(agentId: string, claim: SymbolClaim): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.claims.push(claim);
  }

  removeClaim(agentId: string, filePath: string, symbolName: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.claims = agent.claims.filter(
      (c) => !(c.filePath === filePath && c.symbolName === symbolName)
    );
  }

  addDiff(agentId: string, diff: SemanticDiff): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.recentDiffs.unshift(diff);
    if (agent.recentDiffs.length > MAX_RECENT_DIFFS) {
      agent.recentDiffs.pop();
    }
  }

  // Removes agents that haven't sent a heartbeat in HEARTBEAT_TIMEOUT_MS
  // Returns IDs of removed agents
  pruneStale(): string[] {
    const now = Date.now();
    const stale: string[] = [];
    for (const [id, agent] of this.agents) {
      if (now - agent.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        stale.push(id);
        this.agents.delete(id);
      }
    }
    return stale;
  }

  toPublicRecord(agentId: string): Pick<AgentRecord, 'id' | 'taskDescription' | 'status' | 'claims'> | undefined {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    return { id: agent.id, taskDescription: agent.taskDescription, status: agent.status, claims: agent.claims };
  }
}
