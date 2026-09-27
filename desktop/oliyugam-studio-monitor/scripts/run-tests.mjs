import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const testRunner = path.join(packageDirectory, "node_modules", "tsx", "dist", "cli.mjs");
const packageRequire = createRequire(import.meta.url);
const electronBuilderRequire = createRequire(packageRequire.resolve("electron-builder"));
const electronRebuildEntry = electronBuilderRequire.resolve("@electron/rebuild");
const electronRebuildCli = path.join(path.dirname(electronRebuildEntry), "cli.js");
const testFiles = [
  "config/application-classification.test.ts",
  "src/main/api/real-studio-os-api-client.test.ts",
  "src/main/services/attendance-service.test.ts",
  "src/main/sync/retry-policy.test.ts",
  "src/main/database/local-database.test.ts",
  "src/main/sync/sync-manager.test.ts",
];

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: packageDirectory,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`Could not ${label}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let exitCode = 1;

try {
  const rebuildStatus = run("rebuild better-sqlite3 for Node.js tests", npm, [
    "rebuild",
    "better-sqlite3",
  ]);

  if (rebuildStatus === 0) {
    exitCode = run("run the test suite", process.execPath, [
      testRunner,
      "--test",
      ...testFiles,
    ]);
  } else {
    exitCode = rebuildStatus;
  }
} finally {
  const restoreStatus = run("restore Electron native dependencies", process.execPath, [
    electronRebuildCli,
    "--force",
    "--which-module",
    "better-sqlite3",
    "--module-dir",
    packageDirectory,
  ]);

  if (restoreStatus !== 0) {
    console.error(
      "Could not restore better-sqlite3 for Electron. Do not package this checkout until `pnpm install` succeeds.",
    );
    if (exitCode === 0) exitCode = restoreStatus;
  }
}

process.exitCode = exitCode;