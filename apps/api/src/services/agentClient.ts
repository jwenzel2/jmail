import type {
  AgentHealth,
  BayesStats,
  GlobalSpamConfig,
  LintResult,
  SenderListEntry,
} from '@jmail/shared';
import { config } from '../config.js';

export class AgentNotConfiguredError extends Error {
  constructor() {
    super('jmail-agent is not configured (set AGENT_URL and AGENT_TOKEN)');
    this.name = 'AgentNotConfiguredError';
  }
}

export function isAgentConfigured(): boolean {
  return Boolean(config.AGENT_URL && config.AGENT_TOKEN);
}

async function agentFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isAgentConfigured()) throw new AgentNotConfiguredError();
  const res = await fetch(`${config.AGENT_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.AGENT_TOKEN}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`agent ${init.method ?? 'GET'} ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const agent = {
  health: () => agentFetch<AgentHealth>('/health'),

  bayesStats: (user?: string) =>
    agentFetch<BayesStats>(`/bayes/stats${user ? `?user=${encodeURIComponent(user)}` : ''}`),

  getUserLists: (user: string) =>
    agentFetch<{ entries: SenderListEntry[] }>(`/users/${encodeURIComponent(user)}/lists`),

  setUserLists: (user: string, entries: SenderListEntry[]) =>
    agentFetch<{ entries: SenderListEntry[] }>(`/users/${encodeURIComponent(user)}/lists`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),

  getGlobalConfig: () => agentFetch<GlobalSpamConfig>('/config'),

  validateConfig: (content: string) =>
    agentFetch<LintResult>('/config/validate', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  applyConfig: (content: string) =>
    agentFetch<LintResult>('/config', { method: 'PUT', body: JSON.stringify({ content }) }),
};
