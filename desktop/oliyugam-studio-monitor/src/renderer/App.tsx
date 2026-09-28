import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AttendanceState, FoundationSnapshot, SelectedApplication } from "../../shared/contracts.js";

type LoadState = "loading" | "ready" | "error";
type AttendanceAction = "clock-in" | "clock-out" | "break-start" | "break-end";

export function App() {
  const [snapshot, setSnapshot] = useState<FoundationSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const hasLiveUpdate = useRef(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = window.studioMonitor.onStatusChanged((value) => {
      hasLiveUpdate.current = true;
      if (mounted) {
        setSnapshot(value);
        setLoadState("ready");
      }
    });

    void window.studioMonitor
      .getFoundationSnapshot()
      .then((value) => {
        if (!mounted) return;
        if (!hasLiveUpdate.current) setSnapshot(value);
        setLoadState("ready");
      })
      .catch(() => {
        if (mounted) setLoadState("error");
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function reloadSnapshot() {
    setLoadState("loading");
    setError("");
    try {
      setSnapshot(await window.studioMonitor.getFoundationSnapshot());
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  async function runMutation(mutation: () => Promise<FoundationSnapshot>, message: string) {
    setPending(true);
    setError("");
    try {
      setSnapshot(await mutation());
    } catch {
      setError(message);
    } finally {
      setPending(false);
    }
  }

  if (loadState === "loading" && !snapshot) return <LoadingView />;
  if (loadState === "error" && !snapshot) return <LoadError onRetry={() => void reloadSnapshot()} />;
  if (!snapshot) return <LoadingView />;

  if (!snapshot.employee) {
    return (
      <SetupView
        version={snapshot.version}
        apiState={snapshot.apiState}
        pending={pending}
        error={error}
        onDismissError={() => setError("")}
        onSubmit={(displayName) =>
          void runMutation(
            () => window.studioMonitor.completeSetup(displayName),
            "We couldn't save your name. Please try again.",
          )
        }
      />
    );
  }

  return (
    <Dashboard
      snapshot={snapshot}
      pending={pending}
      error={error}
      onDismissError={() => setError("")}
      onAttendance={(action) =>
        void runMutation(
          () => window.studioMonitor.applyAttendanceAction(action),
          "That attendance update didn't go through. Please try again.",
        )
      }
      onMonitoring={(enabled) =>
        void runMutation(
          () => window.studioMonitor.setMonitoringEnabled(enabled),
          "We couldn't update monitoring on this device. Please try again.",
        )
      }
      onAutoStart={(enabled) =>
        void runMutation(
          () => window.studioMonitor.setAutoStartEnabled(enabled),
          "We couldn't update the startup preference. Please try again.",
        )
      }
      onSelectedApplications={(applications) =>
        void runMutation(
          () => window.studioMonitor.setSelectedApplications(applications),
          "We couldn't save the selected applications. Please try again.",
        )
      }
      onSignOut={() =>
        void runMutation(
          () => window.studioMonitor.signOut(),
          "We couldn't sign you out just now. Please try again.",
        )
      }
    />
  );
}

interface SetupViewProps {
  version: string;
  apiState: FoundationSnapshot["apiState"];
  pending: boolean;
  error: string;
  onDismissError: () => void;
  onSubmit: (displayName: string) => void;
}

function SetupView({ version, apiState, pending, error, onDismissError, onSubmit }: SetupViewProps) {
  const [displayName, setDisplayName] = useState("");
  const [validationError, setValidationError] = useState("");
  const setupAvailable = apiState === "demo";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setValidationError("Enter your name to set up this device.");
      return;
    }
    setValidationError("");
    onSubmit(trimmedName);
  }

  return (
    <main className="app-shell">
      <Header version={version} />
      <section className="content setup-layout" aria-labelledby="setup-title">
        <div className="setup-intro">
          <p className="eyebrow accent">YOUR WORKSTATION</p>
          <h1 id="setup-title">A clear view of your workday.</h1>
          <p className="lead">
            {setupAvailable
              ? "Set up this device with the name your team knows you by. No password is needed here."
              : "Studio OS setup is unavailable until its API contract and connection are configured."}
          </p>
        </div>
        <div>
          {error && <ErrorBanner message={error} onDismiss={onDismissError} />}
          <form className="panel setup-card" onSubmit={handleSubmit}>
            <h2>{setupAvailable ? "Start with your name" : "Studio OS connection needed"}</h2>
            <p>
              {setupAvailable
                ? "This creates a local employee profile for this workstation."
                : "No employee sign-in or device enrollment is available in this build."}
            </p>
            {setupAvailable ? (
              <>
                <label className="field-label" htmlFor="employee-name">Display name</label>
                <input
                  id="employee-name"
                  className="text-input"
                  type="text"
                  autoComplete="name"
                  maxLength={80}
                  placeholder="For example, Sam Rivera"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    if (validationError) setValidationError("");
                  }}
                  aria-describedby={validationError ? "name-hint name-error" : "name-hint"}
                  aria-invalid={Boolean(validationError)}
                  disabled={pending}
                  data-testid="input-display-name"
                />
                <p id="name-hint" className="form-hint">Use the name you want shown on this device.</p>
                {validationError && <p id="name-error" className="form-hint" role="alert">{validationError}</p>}
                <button className="action-button primary setup-submit" type="submit" disabled={pending} data-testid="button-complete-setup">
                  {pending ? "Setting up…" : "Set up this device"}
                  <ArrowIcon />
                </button>
              </>
            ) : null}
            <div className="setup-trust">
              <span className="callout-mark" aria-hidden="true">i</span>
              <span>
                {setupAvailable
                  ? "Demo enrollment stays on this device. Monitoring stays off until you enable it. Nothing connects to Studio OS."
                  : "No connection or employee data is sent. Setup will be available when the documented Studio OS API is configured."}
              </span>
            </div>
          </form>
        </div>
      </section>
      <div className="bottom-rule" aria-hidden="true" />
    </main>
  );
}

interface DashboardProps {
  snapshot: FoundationSnapshot;
  pending: boolean;
  error: string;
  onDismissError: () => void;
  onAttendance: (action: AttendanceAction) => void;
  onMonitoring: (enabled: boolean) => void;
  onAutoStart: (enabled: boolean) => void;
  onSelectedApplications: (applications: readonly SelectedApplication[]) => void;
  onSignOut: () => void;
}

function Dashboard({
  snapshot,
  pending,
  error,
  onDismissError,
  onAttendance,
  onMonitoring,
  onAutoStart,
  onSelectedApplications,
  onSignOut,
}: DashboardProps) {
  const employee = snapshot.employee;
  if (!employee) return null;

  const initials = employee.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const isMonitoring = snapshot.monitoringState === "active";
  const monitoringUnavailable = snapshot.monitoringState === "unsupported";
  const attendanceLabel = getAttendanceLabel(snapshot.attendanceState);
  const apiLabel = getApiLabel(snapshot.apiState);
  const attendanceEnabled: Record<AttendanceAction, boolean> = {
    "clock-in": snapshot.attendanceState === "not-working",
    "break-start": snapshot.attendanceState === "working",
    "break-end": snapshot.attendanceState === "on-break",
    "clock-out": snapshot.attendanceState === "working" || snapshot.attendanceState === "on-break",
  };

  return (
    <main className="app-shell">
      <Header version={snapshot.version} />
      <section className="content" aria-labelledby="dashboard-title">
        <div className="intro">
          <div className="intro-copy">
            <p className="eyebrow accent">WORKSTATION STATUS</p>
            <h1 id="dashboard-title">Your day, at a glance.</h1>
            <p className="lead">A straightforward view of this device and your work session.</p>
          </div>
          <div className="employee-pill" data-testid="employee-identity">
            <span className="employee-avatar" aria-hidden="true">{initials || "—"}</span>
            <span>
              <span className="employee-name">{employee.displayName}</span>
              <span className="employee-device">{snapshot.device.displayName}</span>
            </span>
          </div>
        </div>

        {error && <ErrorBanner message={error} onDismiss={onDismissError} />}

        <div className="dashboard-grid">
          <section className="panel attendance-panel" aria-labelledby="attendance-heading">
            <div className="panel-heading">
              <div>
                <p className="section-label">Today · attendance</p>
                <h2 className="panel-title" id="attendance-heading">Work session</h2>
              </div>
              <span className={`state-badge ${snapshot.attendanceState === "on-break" ? "is-break" : snapshot.attendanceState === "not-working" ? "is-idle" : ""}`} data-testid="status-attendance">
                {attendanceLabel}
              </span>
            </div>
            <div className="attendance-summary">
              <span className="attendance-state-text">{attendanceLabel}</span>
              <span className="attendance-caption">for today</span>
            </div>
            <div className="action-grid" aria-label="Attendance actions">
              <AttendanceButton
                action="clock-in"
                label="Clock in"
                enabled={attendanceEnabled["clock-in"]}
                pending={pending}
                primary
                onClick={onAttendance}
              />
              <AttendanceButton
                action="break-start"
                label="Start break"
                enabled={attendanceEnabled["break-start"]}
                pending={pending}
                onClick={onAttendance}
              />
              <AttendanceButton
                action="break-end"
                label="End break"
                enabled={attendanceEnabled["break-end"]}
                pending={pending}
                onClick={onAttendance}
              />
              <AttendanceButton
                action="clock-out"
                label="Clock out"
                enabled={attendanceEnabled["clock-out"]}
                pending={pending}
                onClick={onAttendance}
              />
            </div>
            <p className="session-note">Only the next available attendance actions can be selected.</p>
          </section>

          <div className="side-stack">
            <section className="panel connection-panel" aria-labelledby="connection-heading">
              <p className="section-label">Service connection</p>
              <div className="connection-row">
                <div>
                  <h2 className="connection-title" id="connection-heading">{apiLabel.title}</h2>
                  <p className="connection-copy">{apiLabel.detail}</p>
                </div>
                <span className={`connection-badge ${snapshot.apiState === "not-configured" || snapshot.apiState === "offline" ? "not-ready" : ""}`} data-testid="status-api">
                  {apiLabel.badge}
                </span>
              </div>
              <div className="local-callout">
                <span className="callout-mark" aria-hidden="true">i</span>
                <span>
                  {snapshot.apiState === "demo"
                    ? "Demo enrollment and sync stay on this device. Nothing connects to Studio OS."
                    : "No Studio OS connection is made by local demo enrollment or sync."}
                </span>
              </div>
            </section>

            <section className="panel monitoring-panel" aria-labelledby="monitoring-heading">
              <p className="section-label">Device agent</p>
              <div className="monitor-row">
                <div className="monitor-copy">
                  <strong id="monitoring-heading">Monitoring</strong>
                  <span>{getMonitoringDescription(snapshot.monitoringState)}</span>
                </div>
                <button
                  className="switch"
                  type="button"
                  role="switch"
                  aria-checked={isMonitoring}
                  aria-label="Enable monitoring"
                  disabled={pending || monitoringUnavailable}
                  onClick={() => onMonitoring(!isMonitoring)}
                  data-testid="toggle-monitoring"
                >
                  <span className="switch-thumb" />
                </button>
              </div>
            </section>
          </div>
        </div>

        <section className="panel metrics-panel" aria-labelledby="metrics-heading">
          <div className="metrics-top">
            <div>
              <p className="section-label">Device resources</p>
              <h2 className="panel-title" id="metrics-heading">Availability</h2>
            </div>
            <p className="metrics-caption">{snapshot.metrics ? `Sampled ${formatTime(snapshot.metrics.sampledAt)}` : "No current sample"}</p>
          </div>
          <div className="metrics-grid" data-testid="device-metrics">
            <Metric label="CPU" value={snapshot.metrics ? `${formatPercent(snapshot.metrics.cpuPercent)}` : null} unit={snapshot.metrics ? "%" : undefined} />
            <Metric label="Memory" value={snapshot.metrics ? `${formatPercent(snapshot.metrics.memoryPercent)}` : null} unit={snapshot.metrics ? "%" : undefined} />
            <Metric label="Disk" value={snapshot.metrics ? `${formatPercent(snapshot.metrics.diskPercent)}` : null} unit={snapshot.metrics ? "%" : undefined} />
            <Metric label="Network" value={snapshot.metrics ? (snapshot.metrics.networkAvailable ? "Available" : "Unavailable") : null} />
          </div>
        </section>

        <section className="panel process-panel" aria-label="Local process and sync details">
          <div className="process-block">
            <p className="section-label">Current process</p>
            <p className={`process-name ${snapshot.currentApplication ? "" : "process-empty"}`} data-testid="text-current-process">
              {snapshot.currentApplication || "No process reported"}
            </p>
          </div>
          <div className="detail-list">
            <DetailItem label="Pending queue" value={`${snapshot.pendingSyncCount} ${snapshot.pendingSyncCount === 1 ? "item" : "items"}`} testId="text-pending-queue" />
            <DetailItem label="Needs attention" value={`${snapshot.failedSyncCount} ${snapshot.failedSyncCount === 1 ? "item" : "items"}`} testId="text-failed-queue" />
            <DetailItem label="Last local-demo sync" value={formatDateTime(snapshot.lastSuccessfulSync)} testId="text-last-sync" />
            <DetailItem label="Device ID" value={snapshot.device.id || "Not reported"} />
          </div>
        </section>

        <section className="panel monitoring-panel" aria-label="Workstation preferences">
          <div className="monitor-row" style={{ marginTop: 0 }}>
            <div className="monitor-copy">
              <strong>Start with Windows</strong>
              <span>Open Studio Monitor when you sign in to this device.</span>
            </div>
            <button
              className="switch"
              type="button"
              role="switch"
              aria-checked={snapshot.autoStartEnabled}
              aria-label="Start Studio Monitor with Windows"
              disabled={pending}
              onClick={() => onAutoStart(!snapshot.autoStartEnabled)}
              data-testid="toggle-auto-start"
            >
              <span className="switch-thumb" />
            </button>
          </div>
        </section>

        <SelectedApplicationsPanel
          applications={snapshot.selectedApplications}
          pending={pending}
          onChange={onSelectedApplications}
        />

        <footer className="footer-bar">
          <p className="privacy-line">
            Process names only. This view does not show window titles, screenshots, keystrokes, or message content.
          </p>
          <button className="signout-button" type="button" onClick={onSignOut} disabled={pending} data-testid="button-sign-out">
            <SignOutIcon />
            Sign out
          </button>
        </footer>
      </section>
      <div className="bottom-rule" aria-hidden="true" />
    </main>
  );
}

interface AttendanceButtonProps {
  action: AttendanceAction;
  label: string;
  enabled: boolean;
  pending: boolean;
  primary?: boolean;
  onClick: (action: AttendanceAction) => void;
}

function AttendanceButton({ action, label, enabled, pending, primary = false, onClick }: AttendanceButtonProps) {
  return (
    <button
      className={`action-button ${primary && enabled ? "primary" : ""}`}
      type="button"
      disabled={!enabled || pending}
      onClick={() => onClick(action)}
      data-testid={`button-${action}`}
    >
      <AttendanceIcon action={action} />
      {label}
    </button>
  );
}

interface MetricProps {
  label: string;
  value: string | null;
  unit?: string | undefined;
}

function Metric({ label, value, unit }: MetricProps) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value" data-testid={`metric-${label.toLowerCase()}`}>
        {value ?? "—"}{value && unit && <small>{unit}</small>}
      </span>
      <span className="metric-foot">{value === null ? "Not available" : label === "Network" ? "Local availability" : "Current usage"}</span>
    </div>
  );
}

interface DetailItemProps {
  label: string;
  value: string;
  testId?: string;
}

function DetailItem({ label, value, testId }: DetailItemProps) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </div>
  );
}

function Header({ version }: { version: string }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">O</span>
        <div>
          <p className="eyebrow">OLIYUGAM</p>
          <p className="brand-name">Studio Monitor</p>
        </div>
      </div>
      <div className="topbar-meta">
        <span className="local-indicator">Local workstation</span>
        <span className="version" data-testid="text-version">v{version}</span>
      </div>
    </header>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <p>{message}</p>
      <button className="error-dismiss" type="button" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

function LoadingView() {
  return (
    <main className="loading-shell" aria-label="Loading Studio Monitor" aria-busy="true">
      <div className="loading-card">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton-row">
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
        </div>
      </div>
    </main>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="loading-shell">
      <section className="load-error" role="alert">
        <p className="eyebrow accent">LOCAL STATUS</p>
        <h1>We couldn't open your status.</h1>
        <p>Studio Monitor couldn't read this device's information. Try again, or close and reopen the app.</p>
        <button className="action-button primary" type="button" onClick={onRetry} data-testid="button-retry">
          Try again
        </button>
      </section>
    </main>
  );
}

function AttendanceIcon({ action }: { action: AttendanceAction }) {
  const common = { className: "action-icon", viewBox: "0 0 20 20", fill: "none", "aria-hidden": true as const };
  if (action === "clock-in") {
    return <svg {...common}><path d="M10 3.5v13M3.5 10h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  }
  if (action === "clock-out") {
    return <svg {...common}><path d="M3.5 10h13M11.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (action === "break-start") {
    return <svg {...common}><path d="M7 5.5v9M13 5.5v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  return <svg {...common}><path d="M6 10a4 4 0 1 1 1.17 2.83M5.5 13.5V10h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10h11M10.5 5.5 15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M8.5 4.5H5.75A1.75 1.75 0 0 0 4 6.25v7.5c0 .97.78 1.75 1.75 1.75H8.5M11.5 6.5l3.5 3.5-3.5 3.5M7.5 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getAttendanceLabel(state: AttendanceState) {
  if (state === "working") return "Working";
  if (state === "on-break") return "On break";
  return "Not clocked in";
}

function getApiLabel(state: FoundationSnapshot["apiState"]) {
  if (state === "demo") return { title: "Local demo adapter", detail: "Demo mode · local-only enrollment and sync", badge: "Local demo" };
  if (state === "connected") return { title: "API connection", detail: "Connection status reported by this device", badge: "Connected" };
  if (state === "offline") return { title: "API connection", detail: "No active connection is reported", badge: "Offline" };
  return { title: "API not configured", detail: "No service endpoint is configured on this device", badge: "Not configured" };
}

function getMonitoringDescription(state: FoundationSnapshot["monitoringState"]) {
  if (state === "active") return "Active on this device";
  if (state === "paused") return "Paused on this device";
  if (state === "not-started") return "Not started";
  return "Unavailable for this device";
}

function formatPercent(value: number) {
  return Number.isFinite(value) ? String(Math.round(value)) : "—";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "No successful sync";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function SelectedApplicationsPanel({
  applications,
  pending,
  onChange,
}: {
  applications: readonly SelectedApplication[];
  pending: boolean;
  onChange: (applications: readonly SelectedApplication[]) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [executableName, setExecutableName] = useState("");
  const [validationError, setValidationError] = useState("");

  function addApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const display = displayName.trim();
    const executable = executableName.trim().toLowerCase();
    if (!display || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,127}\.exe$/iu.test(executable)) {
      setValidationError("Enter a display name and an executable ending in .exe.");
      return;
    }
    const id = executable.replace(/\.exe$/iu, "").replace(/[^a-z0-9]+/giu, "-").replace(/^-+|-+$/gu, "").toLowerCase();
    if (!id || applications.some((application) => application.id === id || application.executableName.toLowerCase() === executable)) {
      setValidationError("This application is already in the selected list.");
      return;
    }
    onChange([...applications, {
      id,
      displayName: display,
      executableName: executable,
      enabled: true,
      supportLevel: "basic",
      connectorId: null,
    }]);
    setDisplayName("");
    setExecutableName("");
    setValidationError("");
  }

  return (
    <section className="panel selected-applications-panel" aria-labelledby="selected-applications-heading">
      <div>
        <p className="section-label">Work applications</p>
        <h2 className="panel-title" id="selected-applications-heading">Selected software</h2>
        <p className="selection-copy">Only enabled applications in this list are recorded as work-application usage. Other processes are ignored.</p>
      </div>
      <form className="application-form" onSubmit={addApplication}>
        <input className="text-input" aria-label="Application display name" placeholder="Application name" value={displayName} disabled={pending} onChange={(event) => setDisplayName(event.target.value)} />
        <input className="text-input" aria-label="Application executable name" placeholder="for example, blender.exe" value={executableName} disabled={pending} onChange={(event) => setExecutableName(event.target.value)} />
        <button className="action-button" type="submit" disabled={pending}>Add application</button>
      </form>
      {validationError && <p className="form-hint" role="alert">{validationError}</p>}
      {applications.length === 0 ? <p className="selection-empty">No work applications selected yet.</p> : (
        <ul className="application-list" aria-label="Selected work applications">
          {applications.map((application) => (
            <li key={application.id}>
              <div>
                <strong>{application.displayName}</strong>
                <span>{application.executableName} · {application.supportLevel === "enhanced" ? "Verified integration" : "Foreground usage"}</span>
              </div>
              <div className="application-actions">
                <button className="text-button" type="button" disabled={pending} onClick={() => onChange(applications.map((item) => item.id === application.id ? { ...item, enabled: !item.enabled } : item))}>{application.enabled ? "Disable" : "Enable"}</button>
                <button className="text-button" type="button" disabled={pending} onClick={() => onChange(applications.filter((item) => item.id !== application.id))}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="selection-copy">Software-specific work states, such as rendering or exporting, appear only when a verified connector is installed for that software.</p>
    </section>
  );
}
