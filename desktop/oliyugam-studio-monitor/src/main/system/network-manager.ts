import { networkInterfaces } from "node:os";

export class NetworkManager {
  /**
   * Reports whether Windows currently exposes a non-loopback address.
   * This is a local network-state signal, not proof that Studio OS is reachable.
   */
  isNetworkAvailable(): boolean {
    const interfaces = networkInterfaces();
    return Object.values(interfaces).some((addresses) =>
      addresses?.some((address) => !address.internal && address.address.length > 0),
    );
  }
}