export type ProviderRuntimeStatus = "active" | "rate_limited" | "unavailable";

export interface ProviderConfig {
  name: string;
  authToken: string;
  baseUrl: string;
  model: string;
}

export interface ProviderRuntimeState {
  status: ProviderRuntimeStatus;
  rateLimitedAt?: string;
  unavailableAt?: string;
}

export interface ProviderStateFile {
  currentProvider?: string;
  totalSwitches: number;
  lastSwitchAt?: string;
  providers: Record<string, ProviderRuntimeState>;
}

export interface ProviderSwitchResult {
  success: boolean;
  previousProvider?: string;
  newProvider?: string;
  reason?: string;
  instructions?: string;
}
