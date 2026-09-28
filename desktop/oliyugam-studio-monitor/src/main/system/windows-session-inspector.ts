import { execFile } from "node:child_process";

export interface SessionSample {
  idleMilliseconds: number;
  processName: string | null;
}

type PowerShellRunner = (script: string) => Promise<string>;

const POWERSHELL_SCRIPT = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class StudioMonitorSession {
  [StructLayout(LayoutKind.Sequential)]
  private struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool GetLastInputInfo(ref LASTINPUTINFO value);
  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  public static uint IdleMilliseconds() {
    var value = new LASTINPUTINFO();
    value.cbSize = (uint)Marshal.SizeOf(value);
    if (!GetLastInputInfo(ref value)) return 0;
    return unchecked((uint)Environment.TickCount - value.dwTime);
  }
  public static uint ForegroundProcessId() {
    var window = GetForegroundWindow();
    if (window == IntPtr.Zero) return 0;
    uint processId;
    GetWindowThreadProcessId(window, out processId);
    return processId;
  }
}
'@
$idle = [StudioMonitorSession]::IdleMilliseconds()
$processId = [StudioMonitorSession]::ForegroundProcessId()
$processName = ""
if ($processId -gt 0) {
  try {
    $processName = "$(Get-Process -Id $processId -ErrorAction Stop | Select-Object -ExpandProperty ProcessName).exe"
  } catch { }
}
Write-Output "$idle|$processName"
`;

export class WindowsSessionInspector {
  readonly #runPowerShell: PowerShellRunner;

  constructor(runner: PowerShellRunner = runPowerShell) {
    this.#runPowerShell = runner;
  }

  async sample(): Promise<SessionSample> {
    if (process.platform !== "win32") {
      throw new Error("Windows session inspection is only available on Windows.");
    }

    const output = await this.#runPowerShell(POWERSHELL_SCRIPT);
    const separator = output.indexOf("|");
    if (separator < 1) throw new Error("Windows session sample was invalid.");

    const idleMilliseconds = Number(output.slice(0, separator).trim());
    if (!Number.isFinite(idleMilliseconds) || idleMilliseconds < 0) {
      throw new Error("Windows session idle value was invalid.");
    }

    return {
      idleMilliseconds,
      processName: normalizeProcessName(output.slice(separator + 1)),
    };
  }
}

function normalizeProcessName(value: string): string | null {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,127}$/u.test(normalized)) return null;
  return normalized.toLowerCase().endsWith(".exe") ? normalized : normalized + ".exe";
}

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script],
      { windowsHide: true, timeout: 4_000, maxBuffer: 2_048 },
      (error, stdout) => {
        if (error) {
          reject(new Error("Windows session inspector failed."));
          return;
        }
        resolve(stdout.trim());
      },
    );
    child.once("error", () => reject(new Error("Windows session inspector failed.")));
  });
}
