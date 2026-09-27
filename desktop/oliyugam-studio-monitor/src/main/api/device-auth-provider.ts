import type { ApiResult, Device, Employee } from "../../../shared/contracts.js";

/**
 * Demo-facing auth seam. Production sign-in must use organization-issued
 * credentials and keep the employee session separate from the enrolled
 * device's revocable credentials, as defined in lib/api-spec/openapi.yaml.
 * A display name alone is never proof of employee identity.
 */
export interface DeviceAuthProvider {
  authenticate(displayName: string): Promise<ApiResult<Employee>>;
  enrollDevice(device: Device): Promise<ApiResult<Device>>;
  signOutDevice(): Promise<ApiResult<void>>;
  revokeDevice(deviceId: string): Promise<ApiResult<void>>;
}