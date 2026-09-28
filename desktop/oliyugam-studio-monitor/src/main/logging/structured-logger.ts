import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocalDatabase, LogLevel } from "../database/local-database.js";

export type LogCode =
  | "APP_STARTED"
  | "APP_STOPPED"
  | "WINDOW_OPEN_FAILED"
  | "MONITORING_STARTED"
  | "MONITORING_STOPPED"
  | "MONITORING_SAMPLE_FAILED"
  | "DATABASE_ERROR"
  | "SYNC_FAILED"
  | "SYNC_COMPLETED"
  | "QUEUE_LIMIT_REACHED"
  | "DEVICE_SETUP_COMPLETED"
  | "ATTENDANCE_INVALID_TRANSITION"
  | "CONFIGURATION_INVALID"
  | "ADOBE_CONNECTOR_BRIDGE_UNAVAILABLE"
  | "UNHANDLED_ERROR";

const MAX_FILE_BYTES = 1_000_000;
const ROTATED_FILES = 3;

export class StructuredLogger {
  readonly #logDirectory: string;
  readonly #database: LocalDatabase;
  #writeChain: Promise<void> = Promise.resolve();

  constructor(logDirectory: string, database: LocalDatabase) {
    this.#logDirectory = logDirectory;
    this.#database = database;
  }

  info(code: LogCode): void {
    this.#write("info", code);
  }

  warn(code: LogCode): void {
    this.#write("warn", code);
  }

  error(code: LogCode): void {
    this.#write("error", code);
  }

  async flush(): Promise<void> {
    await this.#writeChain;
  }

  #write(level: LogLevel, code: LogCode): void {
    const createdAt = new Date().toISOString();
    const record = JSON.stringify({ createdAt, level, code });
    this.#writeChain = this.#writeChain.then(async () => {
      await mkdir(this.#logDirectory, { recursive: true });
      const logFile = join(this.#logDirectory, "agent.log");
      try {
        const metadata = await stat(logFile);
        if (metadata.size >= MAX_FILE_BYTES) await this.#rotate();
      } catch {
        // A missing log file is the normal first-run state.
      }
      await writeFile(logFile, `${record}\n`, { flag: "a", mode: 0o600 });
      this.#database.addLocalLog(level, code, code, createdAt);
    }).catch(() => {
      // Logging must not crash the monitoring process.
    });
  }

  async #rotate(): Promise<void> {
    for (let index = ROTATED_FILES; index >= 1; index -= 1) {
      const source = join(this.#logDirectory, index === 1 ? "agent.log" : `agent.log.${index - 1}`);
      const destination = join(this.#logDirectory, `agent.log.${index}`);
      try {
        if (index === ROTATED_FILES) {
          await import("node:fs/promises").then(({ unlink }) => unlink(destination).catch(() => undefined));
        }
        await rename(source, destination);
      } catch {
        // Rotation is best effort; the active log remains bounded on the next write.
      }
    }
  }
}
