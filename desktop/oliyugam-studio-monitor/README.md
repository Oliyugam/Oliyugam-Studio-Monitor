# Oliyugam Studio Monitor

Standalone, Windows-first Electron desktop app. Its code and dependencies live in this package; it does not depend on or claim a connection to Oliyugam Studio OS.

## V1 status

The local V1 foundation includes a React setup/dashboard, a main-process-owned monitoring lifecycle, local SQLite storage, a bounded offline event queue, attendance actions, Windows idle/process-name sampling, basic device metrics, structured rotating logs, a tray menu, startup preference, and an NSIS installer configuration.

The default API mode is **local demo**. Demo setup accepts a display name, records a local mock enrollment, and acknowledges sync locally. It does not authenticate a person or device with a server. The approved Studio OS wire contract is documented in `lib/api-spec/openapi.yaml`, but no server or production HTTP integration is enabled: `RealStudioOSApiClient` deliberately fails closed. `STUDIO_MONITOR_API_BASE_URL` is validated but is not currently used to make requests.

Monitoring is off after setup and must be enabled from the dashboard. Monitoring and system sampling are Windows-only; on other platforms the dashboard reports that monitoring is unavailable.

## Selected work applications

The dashboard keeps a local list of selected work applications. Only an enabled executable from that list can create an application-usage record; other foreground processes are ignored. Add the executable name exactly as Windows reports it, for example `blender.exe`.

The current build provides foreground-usage support for selected applications. Software-specific states such as rendering, exporting, or encoding require a verified connector for the relevant product and version. The connector contract is present, but no product connector is installed in this build, so the dashboard does not claim those states.

## Technology and layout

- Electron 44, Node.js 24, TypeScript 5.9 strict mode
- React 19 renderer bundled with Vite
- SQLite through `better-sqlite3`
- `tsup` bundles the Electron main process and preload as CommonJS; the native SQLite module stays external
- `electron-builder` targets a Windows x64 NSIS installer
- `config/` contains app, Vite, bundler, and installer configuration
- `shared/` contains contracts shared across the renderer and main process
- `src/main/` owns persistence, monitoring, sync, API adapters, and lifecycle
- `src/preload/` exposes a narrow, typed IPC bridge
- `src/renderer/` contains the React UI and has no direct Node or network access

## Privacy and security boundaries

- Browser windows enable context isolation, sandboxing, and web security; Node integration is disabled.
- The preload bridge exposes named operations only. It does not expose generic IPC or Node APIs.
- IPC inputs are validated in the main process.
- Monitoring starts only after local setup and an explicit dashboard opt-in. Signing out stops monitoring and clears that opt-in.
- Collected process information is limited to the process name. The app does not read or save window titles, screenshots, keystrokes, typed content, messages, webcam, or microphone data.
- Activity and application usage are aggregated into bounded-duration local events. System metrics and event payloads are stored locally until acknowledged by an adapter.
- Employee and device credentials are distinct. Any future API integration must store credentials only through Electron `safeStorage`; there is no plaintext fallback. The current local demo issues and stores no authentication token.
- Logs use fixed event codes rather than raw exception text and rotate locally. Local log rows are capped.
- Closing the dashboard window does not stop the background process. Use the tray’s **Exit** command to stop the app.
- The installer is configured to preserve app data when uninstalled. Local database/log contents therefore need to be removed separately if the device owner wants them erased.

## Build and run on Windows

Use Node.js 24 and pnpm 10. Installing `better-sqlite3` may require native build tools if a matching prebuilt binary is unavailable:

- **Windows:** Python 3 and Visual Studio Build Tools with the **Desktop development with C++** workload.
- **Linux:** Python 3, `make`, and a C/C++ compiler (for example, `build-essential` on Debian/Ubuntu).

`pnpm test` rebuilds `better-sqlite3` for host Node.js while running tests, then force-rebuilds it for Electron, including when a test fails. The same native build tools may be needed for either rebuild.

From this directory:

```powershell
pnpm install
pnpm dev
```

The Vite server binds to `127.0.0.1`. To run checks and build unpackaged files:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Build the Windows x64 NSIS installer:

```powershell
pnpm dist:win
```

The configured output is:

```text
release/Oliyugam-Studio-Monitor-Setup.exe
```

The project has no code-signing certificate configured. Do not describe an installer as trusted or signed unless a Windows release build is signed and verified; unsigned builds may show SmartScreen warnings.

## Release status

**READY FOR REAL WINDOWS VERIFICATION**

The source/configuration audit confirms the x64 NSIS target and installer filename, the packaged Electron main/preload/renderer paths, and `better-sqlite3` externalization, Electron dependency rebuild, and ASAR unpack settings. The database uses Electron's `userData` path, logs use Electron's `logs` path, startup uses Electron login-item settings, the tray is owned by the main process, and NSIS is configured to preserve app data on uninstall.

Windows runtime behavior and the checklist below have **not** been verified. Code signing is **not configured or verified**. This product is not fully release-ready; do not distribute until the Windows checklist passes.

## Required Windows 10/11 x64 release checklist

These checks are **not yet executed**. Use Node.js 24 and pnpm 10. Run the build checks on a clean Windows 10/11 x64 VM. Run the manual checks on that VM and on a normal user workstation before distribution.

### Build and installer checks

From this package directory, run each command on Windows x64:

1. `pnpm install --frozen-lockfile`
2. `pnpm test`
3. `pnpm typecheck`
4. `pnpm build`
5. `pnpm dist:win`
6. Confirm `release/Oliyugam-Studio-Monitor-Setup.exe` exists.

### Runtime and manual checks

1. **Install and first launch:** install `release/Oliyugam-Studio-Monitor-Setup.exe`; confirm the app opens to local demo setup and does not ask for a password or claim Studio OS authentication.
2. **Local setup:** enter a display name; confirm the dashboard identifies the device as a local demo and says nothing connects to Studio OS.
3. **Opt-in:** confirm monitoring is off immediately after setup. Enable it, confirm the Windows status changes to active, then disable it and confirm sampling stops.
4. **Attendance:** test clock in → start break → end break → clock out. Confirm invalid actions remain disabled and the state survives an app restart on the same local date.
5. **Idle and process sampling:** with monitoring enabled, use a known app, wait past the configured five-minute idle threshold, and confirm state changes. Confirm only a process name appears; no window title is displayed or stored.
6. **System metrics:** confirm CPU, memory, system-drive usage, and local network availability appear after samples; compare approximate values with Windows Task Manager. Disconnecting the network should not be reported as a cloud connection.
7. **Offline queue:** disconnect the network, generate an attendance event, and confirm the pending count increases. Reconnect and confirm the local demo adapter acknowledges the queue and updates “Last local-demo sync.”
8. **Tray and close behavior:** close the window, confirm the tray remains, reopen it, and confirm monitoring state is unchanged. Select **Exit**, then relaunch.
9. **Startup preference:** enable “Start with Windows,” sign out and back in, and verify the app launches. Disable it and verify the next sign-in does not launch it.
10. **Sign out:** sign out while monitoring is active; confirm monitoring stops, its opt-in is cleared, and the local demo setup screen returns.
11. **Suspend/resume and restart:** suspend/resume the PC while opted in, then restart Windows. Confirm monitoring restarts only if the user previously enabled it and is still locally set up.
12. **Unconfigured API mode:** launch with `STUDIO_MONITOR_API_MODE=unconfigured`; confirm the app reports that the API is not configured and makes no network request, even if a base URL is set.
13. **Upgrade/uninstall:** install over an earlier test build and confirm local state is retained. Uninstall and confirm the installer leaves app data in place; remove that data manually only when intentionally testing a clean profile.

## Verification report

### Present in source

- Secure Electron window configuration and explicit preload IPC methods
- Validated setup, attendance, monitoring, and startup IPC inputs
- SQLite persistence, unique client event IDs, queue limits, retry scheduling, terminal failure tracking, and 30-day pruning for acknowledged events
- Local-only mock API and fail-closed unconfigured/production adapter seam
- Explicit monitoring opt-in, sign-out stop behavior, tray controls, and power suspend/resume hooks
- Windows-only idle/process sampling, process-name classification, and basic system health sampling
- Rotating structured logs and a bounded local log table
- Unit tests for app-name classification, attendance transitions, retry policy, database queue behavior, and sync behavior
- Installer filename, x64 NSIS target, and app-data-preserving uninstall configuration

### Verified locally on Linux x64 (2026-09-27)

- `pnpm install --frozen-lockfile` completed with Node.js 24.13.0 and pnpm 10.26.1.
- After that clean install, `pnpm test` passed all 13 tests. The test script temporarily rebuilds `better-sqlite3` for host Node.js and restores the Electron-compatible build afterward.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm dist:win` built the Windows x64 NSIS payload and produced `release/Oliyugam-Studio-Monitor-Setup.exe`. The command exited with an error because electron-builder could not start Wine (`wine process failed ENOENT`); the installer was not executed on Windows.

### Not verified

- A successful clean-install test run on Windows. The Windows/Linux test matrix is configured in `.github/workflows/studio-monitor-tests.yml`, but its Windows job has not run yet.
- A successful `pnpm dist:win` exit on Windows x64 or execution of the generated installer.
- The Windows 10/11 manual checklist above, including monitoring opt-in, process-name privacy, offline queue, tray, startup, suspend/resume, upgrade, and uninstall data preservation.
- Windows x64 clean-install results for `pnpm typecheck` and `pnpm build`.
- Windows monitoring APIs, idle threshold behavior, and Windows 10/11 compatibility.
- Installer signing. No code-signing certificate is configured or verified; do not describe this build as signed or trusted.
- Real employee authentication, device enrollment/revocation, remote configuration, update delivery, or Studio OS synchronization. The connection contract is approved, but the HTTP integration and a Windows verification pass remain necessary.
