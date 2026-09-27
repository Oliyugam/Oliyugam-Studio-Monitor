import type {
  AgentConfiguration,
  ApiResult,
  Device,
  Employee,
  Heartbeat,
  SyncQueueItem,
} from "../../../shared/contracts.js";
import type { StudioMonitorApi } from "./studio-monitor-api.js";

/**
 * Local-only adapter for UI and workflow development. It does not authenticate
 * against Studio OS, create a server-side device, or make network requests.
 */
export class MockStudioMonitorApi implements StudioMonitorApi {
  async authenticate(displayName: string): Promise<ApiResult<Employee>> {
    return {
      ok: true,
      data: {
        id: "local-demo-employee",
        displayName: displayName.trim(),
      },
    };
  }

  async enrollDevice(device: Device): Promise<ApiResult<Device>> {
    return {
      ok: true,
      data: { ...device, enrollmentState: "mock-enrolled" },
    };
  }

  async heartbeat(_payload: Heartbeat): Promise<ApiResult<void>> {
    return { ok: true, data: undefined };
  }

  async syncEvents(items: readonly SyncQueueItem[]): Promise<ApiResult<readonly string[]>> {
    return { ok: true, data: items.map((item) => item.clientEventId) };
  }

  async getConfiguration(): Promise<ApiResult<AgentConfiguration>> {
    return {
      ok: false,
      error: {
        code: "MOCK_CONFIGURATION_UNAVAILABLE",
        message: "The demo adapter does not load remote configuration.",
      },
    };
  }

  async signOutDevice(): Promise<ApiResult<void>> {
    return { ok: true, data: undefined };
  }

  async revokeDevice(_deviceId: string): Promise<ApiResult<void>> {
    return {
      ok: false,
      error: {
        code: "MOCK_REVOCATION_UNAVAILABLE",
        message: "No server-side device exists in local demo mode.",
      },
    };
  }
}