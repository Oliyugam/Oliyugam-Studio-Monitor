import type {
  AgentConfiguration,
  ApiResult,
  Device,
  Employee,
  Heartbeat,
  SyncQueueItem,
} from "../../../shared/contracts.js";
import type { StudioMonitorApi } from "./studio-monitor-api.js";

const unavailable = <T>(): Promise<ApiResult<T>> =>
  Promise.resolve({
    ok: false,
    error: {
      code: "STUDIO_OS_API_NOT_CONFIGURED",
      message: "The Studio OS connection is not enabled.",
    },
  });

/**
 * Fail-closed adapter boundary. It deliberately performs no network requests
 * and never returns simulated success.
 */
export class UnconfiguredStudioMonitorApi implements StudioMonitorApi {
  authenticate(_displayName: string): Promise<ApiResult<Employee>> {
    return unavailable<Employee>();
  }

  enrollDevice(_device: Device): Promise<ApiResult<Device>> {
    return unavailable<Device>();
  }

  heartbeat(_payload: Heartbeat): Promise<ApiResult<void>> {
    return unavailable<void>();
  }

  syncEvents(_items: readonly SyncQueueItem[]): Promise<ApiResult<readonly string[]>> {
    return unavailable<readonly string[]>();
  }

  getConfiguration(): Promise<ApiResult<AgentConfiguration>> {
    return unavailable<AgentConfiguration>();
  }

  signOutDevice(): Promise<ApiResult<void>> {
    return unavailable<void>();
  }

  revokeDevice(_deviceId: string): Promise<ApiResult<void>> {
    return unavailable<void>();
  }
}