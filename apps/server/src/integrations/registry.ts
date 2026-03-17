import type { IntegrationProvider } from "./base.js";

const integrations = new Map<string, IntegrationProvider>();

export function registerIntegration(provider: IntegrationProvider) {
  integrations.set(provider.id, provider);
}

export function getIntegration(id: string) {
  return integrations.get(id);
}

export function listIntegrations() {
  return Array.from(integrations.values()).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
  }));
}
