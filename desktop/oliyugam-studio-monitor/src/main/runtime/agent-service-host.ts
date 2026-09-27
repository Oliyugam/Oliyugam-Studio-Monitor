export interface BackgroundService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Owns background services from the Electron main process, never the renderer.
 * Step 1 intentionally registers no monitoring services.
 */
export class AgentServiceHost {
  readonly #services: readonly BackgroundService[];
  #startedServices: BackgroundService[] = [];
  #isRunning = false;

  constructor(services: readonly BackgroundService[] = []) {
    this.#services = services;
  }

  get isRunning(): boolean {
    return this.#isRunning;
  }

  async start(): Promise<void> {
    if (this.#isRunning) return;

    try {
      for (const service of this.#services) {
        await service.start();
        this.#startedServices.push(service);
      }
      this.#isRunning = true;
    } catch (error: unknown) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const services = this.#startedServices.reverse();
    this.#startedServices = [];

    for (const service of services) {
      await service.stop();
    }

    this.#isRunning = false;
  }
}