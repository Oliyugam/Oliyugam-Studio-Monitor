import { randomUUID } from "node:crypto";
import { hostname, release } from "node:os";
import type { Device, Employee } from "../../../shared/contracts.js";
import type { DeviceAuthProvider } from "../api/device-auth-provider.js";
import type { LocalDatabase } from "../database/local-database.js";
import type { StructuredLogger } from "../logging/structured-logger.js";
import { AuthenticationError, DeviceEnrollmentError } from "./agent-errors.js";

export class DeviceSetupService {
  readonly #database: LocalDatabase;
  readonly #auth: DeviceAuthProvider;
  readonly #logger: StructuredLogger;
  readonly #agentVersion: string;

  constructor(database: LocalDatabase, auth: DeviceAuthProvider, logger: StructuredLogger, agentVersion: string) {
    this.#database = database;
    this.#auth = auth;
    this.#logger = logger;
    this.#agentVersion = agentVersion;
  }

  async completeSetup(displayName: string): Promise<void> {
    const authResult = await this.#auth.authenticate(displayName);
    if (!authResult.ok) throw new AuthenticationError();

    const employee: Employee = authResult.data;
    const existingDevice = this.#database.getDevice();
    const now = new Date().toISOString();
    const device: Device = existingDevice ?? {
      id: randomUUID(),
      displayName: hostname(),
      platform: process.platform,
      operatingSystem: release(),
      agentVersion: this.#agentVersion,
      enrollmentState: "not-enrolled",
      createdAt: now,
      lastSuccessfulSync: null,
      lastHeartbeat: null,
    };

    const enrollmentResult = await this.#auth.enrollDevice(device);
    if (!enrollmentResult.ok) throw new DeviceEnrollmentError();

    this.#database.saveEmployee(employee);
    this.#database.saveDevice(enrollmentResult.data);
    this.#logger.info("DEVICE_SETUP_COMPLETED");
  }

  async signOut(): Promise<void> {
    const device = this.#database.getDevice();
    if (device) await this.#auth.signOutDevice();
    this.#database.saveEmployee(null);
    this.#database.setAttendanceState("not-working");
    if (device) {
      this.#database.saveDevice({ ...device, enrollmentState: "not-enrolled" });
    }
  }
}