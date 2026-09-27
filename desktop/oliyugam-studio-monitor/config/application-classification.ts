import type { ApplicationCategory } from "../shared/contracts.js";

const applicationCategories: ReadonlyMap<string, ApplicationCategory> = new Map([
  ["photoshop", "CREATIVE"],
  ["lightroom", "CREATIVE"],
  ["premiere", "CREATIVE"],
  ["afterfx", "CREATIVE"],
  ["resolve", "CREATIVE"],
  ["winword", "PRODUCTIVITY"],
  ["excel", "PRODUCTIVITY"],
  ["powerpnt", "PRODUCTIVITY"],
  ["outlook", "PRODUCTIVITY"],
  ["code", "PRODUCTIVITY"],
  ["teams", "COMMUNICATION"],
  ["slack", "COMMUNICATION"],
  ["zoom", "COMMUNICATION"],
  ["ms-teams", "COMMUNICATION"],
  ["explorer", "SYSTEM"],
  ["taskmgr", "SYSTEM"],
  ["services", "SYSTEM"],
  ["svchost", "SYSTEM"],
  ["powershell", "SYSTEM"],
  ["cmd", "SYSTEM"],
]);

export function classifyApplication(processName: string): ApplicationCategory {
  return applicationCategories.get(processName.toLowerCase()) ?? "OTHER";
}