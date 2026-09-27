import type {
  AgentConfiguration,
  ApiResult,
  Heartbeat,
  SyncQueueItem,
} from "../../../shared/contracts.js";
import type { DeviceAuthProvider } from "./device-auth-provider.js";

export interface StudioMonitorApi extends DeviceAuthProvider {
  heartbeat(payload: Heartbeat): Promise<ApiResult<void>>;
  syncEvents(items: readonly SyncQueueItem[]): Promise<ApiResult<readonly string[]>>;
  getConfiguration(): Promise<ApiResult<AgentConfiguration>>;
}