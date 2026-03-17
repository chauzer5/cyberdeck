export interface IntegrationProvider {
  id: string;
  name: string;
  type: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  sync(): Promise<void>;
  destroy(): Promise<void>;
}
