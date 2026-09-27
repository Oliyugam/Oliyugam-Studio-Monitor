import { statfs } from "node:fs/promises";
import { cpus, freemem, networkInterfaces, totalmem } from "node:os";
import type { SystemMetrics } from "../../../shared/contracts.js";

interface CpuCounters {
  idle: number;
  total: number;
}

export class SystemHealthMonitor {
  #previousCpu: CpuCounters | null = null;

  async sample(): Promise<SystemMetrics> {
    const cpuPercent = this.#sampleCpuPercent();
    const memoryTotal = totalmem();
    const memoryPercent = memoryTotal > 0
      ? clampPercent(((memoryTotal - freemem()) / memoryTotal) * 100)
      : 0;
    const diskPercent = await this.#sampleSystemDrivePercent();
    const networkAvailable = Object.values(networkInterfaces()).some((addresses) =>
      addresses?.some((address) => !address.internal && address.address.length > 0),
    );

    return {
      sampledAt: new Date().toISOString(),
      cpuPercent,
      memoryPercent,
      diskPercent,
      networkAvailable,
    };
  }

  #sampleCpuPercent(): number {
    const current = cpuCounters();
    const previous = this.#previousCpu;
    this.#previousCpu = current;
    if (!previous) return 0;

    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;
    if (totalDelta <= 0) return 0;
    return clampPercent(((totalDelta - idleDelta) / totalDelta) * 100);
  }

  async #sampleSystemDrivePercent(): Promise<number> {
    if (process.platform !== "win32") throw new Error("Windows disk metrics are unavailable.");
    const drive = process.env.SystemDrive ?? "C:";
    try {
      const stats = await statfs(`${drive}\\`);
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free) || free < 0) {
        throw new Error("Disk metrics are unavailable.");
      }
      return clampPercent(((total - free) / total) * 100);
    } catch {
      throw new Error("Disk metrics are unavailable.");
    }
  }
}

function cpuCounters(): CpuCounters {
  return cpus().reduce<CpuCounters>(
    (total, cpu) => {
      const times = cpu.times;
      return {
        idle: total.idle + times.idle,
        total: total.total + times.user + times.nice + times.sys + times.idle + times.irq,
      };
    },
    { idle: 0, total: 0 },
  );
}

function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}