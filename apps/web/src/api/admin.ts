import type {
  AgentHealth,
  AuditList,
  Branding,
  BrandingUpdate,
  GlobalSpamConfig,
  LintResult,
} from '@jmail/shared';
import { apiGet, apiSend } from './client';

export const updateBranding = (patch: BrandingUpdate) =>
  apiSend<Branding>('PUT', '/api/admin/branding', patch);

export const getSpamConfig = () => apiGet<GlobalSpamConfig>('/api/admin/spam/config');

export const validateSpamConfig = (content: string) =>
  apiSend<LintResult>('POST', '/api/admin/spam/config/validate', { content });

export const applySpamConfig = (content: string) =>
  apiSend<LintResult>('PUT', '/api/admin/spam/config', { content });

export const getAgentHealth = () => apiGet<AgentHealth>('/api/admin/agent/health');

export const getAudit = () => apiGet<AuditList>('/api/admin/audit');
