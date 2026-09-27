import { safeStorage } from "electron";
import type { LocalDatabase } from "../database/local-database.js";

export interface CredentialStore {
  store(key: string, value: string): Promise<void>;
  retrieve(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
}

/**
 * Uses Electron's operating-system-backed encryption. Sensitive credentials
 * may be stored as encrypted ciphertext in the local database, but are never
 * stored in plaintext or exposed to the renderer. This is the only permitted
 * persistence path for employee/device refresh credentials and device tokens.
 * There is deliberately no plaintext fallback.
 */
export class SafeStorageCredentialStore implements CredentialStore {
  readonly #database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.#database = database;
  }

  async store(key: string, value: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("OS secure credential storage is unavailable.");
    }
    const encrypted = safeStorage.encryptString(value);
    this.#database.saveEncryptedCredential(key, encrypted.toString("base64"));
  }

  async retrieve(key: string): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("OS secure credential storage is unavailable.");
    }
    const ciphertext = this.#database.getEncryptedCredential(key);
    return ciphertext ? safeStorage.decryptString(Buffer.from(ciphertext, "base64")) : null;
  }

  async remove(key: string): Promise<void> {
    this.#database.removeEncryptedCredential(key);
  }
}