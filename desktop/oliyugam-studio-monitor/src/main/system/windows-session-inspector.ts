import { execFile } from "node:child_process";

export interface SessionSample {
  idleMilliseconds: number;
  processName: string | null;
}

const POWERSHELL_SCRIPT = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class StudioMonitorSession {
  [StructLayout(LayoutKind.Sequential)]
  private struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")]
  private static extern bool GetLastInputInfo(ref LASTINPUTINFO value);
  [DllImport("user32.dll")]
  private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  public static uint IdleMilliseconds() {
    var value = new LASTINPUTINFO();
    value.cbSize = (uint)Marshal.SizeOf(value);
    if (!GetLastInputInfo(ref value)) return 0;
    return unchecked((uint)Environment.TickCount - value.dwTime);
  }
  public static uint ForegroundProcessId() {
    uint processId;
    GetWindowThreadProcessId(GetForegroundWindow(), out processId);
    return processId;
  }
}
'@
$idle = [StudioMonitorSession]::IdleMilliseconds()
$processId = [StudioMonitorSession]::ForegroundProcessId()
$processName = ''
if ($processId -gt 0) {
  try { $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName } catch { }
}
Write-Output "$idle|$processName"
`;

export class WindowsSessionInspector {
  async sample(): Promise<SessionSample> {
    if (process.platform !== "win32") {
      throw new Error("Windows session inspection is only available on Windows.");
    }

    const output = await runPowerShell(POWERSHELL_SCRIPT);
    const separator = output.indexOf("|");
    if (separator < 1) throw new Error("Windows session sample was invalid.");

    const idleMilliseconds = Number(output.slice(0, separator));
    const rawProcessName = output.slice(separator + 1).trim();
    if (!Number.isFinite(idleMilliseconds) || idleMilliseconds < 0) {
      throw new Error("Windows activity sample was invalid.");
    }

    const processName = /^[\w.-]{1,128}$/u.test(rawProcessName)
      ? rawProcessName
      : null;
    return { idleMilliseconds, processName };
  }
}

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script],
      { windowsHide: true, timeout: 4_000, maxBuffer: 2_048 },
      (error, stdout) => {
        if (error) reject(new Error("Windows session inspection failed."));
        else resolve(stdout.trim());
      },
    );
  });
}