export const APP_NAME = "Oliyugam Studio Monitor";

import { z } from "zod";

const environmentSchema = z.object({
  // The approved Studio OS contract is not an enabled production adapter.
  // Keep the runtime fail-closed until sign-in and HTTP behavior are integrated.
  STUDIO_MONITOR_API_BASE_URL: z.string().url().optional(),
  STUDIO_MONITOR_API_MODE: z.enum(["demo", "unconfigured"]).default("demo"),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(10_000).max(300_000).default(30_000),
  ACTIVITY_SAMPLE_INTERVAL_MS: z.coerce.number().int().min(5_000).max(60_000).default(15_000),
  ACTIVITY_AGGREGATION_INTERVAL_MS: z.coerce.number().int().min(60_000).max(3_600_000).default(900_000),
  IDLE_THRESHOLD_MS: z.coerce.number().int().min(60_000).max(3_600_000).default(300_000),
  SYSTEM_METRIC_INTERVAL_MS: z.coerce.number().int().min(30_000).max(900_000).default(60_000),
  SYNC_INTERVAL_MS: z.coerce.number().int().min(10_000).max(600_000).default(30_000),
  OFFLINE_QUEUE_LIMIT: z.coerce.number().int().min(100).max(100_000).default(10_000),
  SYNC_BATCH_SIZE: z.coerce.number().int().min(10).max(250).default(100),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  throw new Error("Studio Monitor configuration is invalid.");
}

export const agentConfiguration = Object.freeze(parsedEnvironment.data);
export type AgentConfiguration = typeof agentConfiguration;