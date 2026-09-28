import type { SelectedApplication, SoftwareWorkState } from "../../../shared/contracts.js";

/**
 * A software connector reports a product-specific work state without reading
 * titles, files, URLs, typed text, screenshots, or other content.
 */
export interface SoftwareConnector {
  readonly id: string;
  supports(application: SelectedApplication): boolean;
  sample(application: SelectedApplication): Promise<SoftwareWorkState>;
}

export class SoftwareConnectorRegistry {
  constructor(private readonly connectors: readonly SoftwareConnector[]) {}

  find(application: SelectedApplication): SoftwareConnector | null {
    return this.connectors.find((connector) => connector.supports(application)) ?? null;
  }
}
