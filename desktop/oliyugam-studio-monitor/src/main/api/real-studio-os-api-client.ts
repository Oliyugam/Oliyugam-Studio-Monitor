import type { StudioMonitorApi } from "./studio-monitor-api.js";
import { UnconfiguredStudioMonitorApi } from "./unconfigured-studio-monitor-api.js";

/**
 * Explicit production adapter seam. The approved wire contract is documented
 * in lib/api-spec/openapi.yaml, but this adapter remains fail-closed until its
 * HTTP implementation and employee sign-in flow are integrated. No endpoint
 * is contacted by this class.
 */
export class RealStudioOSApiClient extends UnconfiguredStudioMonitorApi implements StudioMonitorApi {}