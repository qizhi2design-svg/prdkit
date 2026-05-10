import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { CreateTemplateOptions } from "#core/create-command.js";
import type { CheckpointDiffSummary, CheckpointRecord } from "#lib/checkpoints/prototype/types.js";
import { ConfigError, FileSystemError, PrototypeError, ValidationError } from "#utils/errors.js";
import { resolveProjectRoot } from "#utils/config.js";

export interface PrototypeListOptions {
  json?: boolean;
}

export interface PrototypeCreateOptions extends CreateTemplateOptions {
  template?: string;
}

export interface CheckpointBaseOptions {
  json?: boolean;
}

export interface CreateOptions extends CheckpointBaseOptions {
  message?: string;
}

export interface RestoreOptions extends CheckpointBaseOptions {
  force?: boolean;
}

export interface SessionStartOptions extends CheckpointBaseOptions {
  name?: string;
}

export const prototypeTemplateAliases: Record<string, string> = {
  default: "prototype",
  web: "prototype",
  desktop: "prototype",
  mobile: "prototype-mobile",
  admin: "prototype-admin",
  "pc-admin": "prototype-admin",
  "prototype-mobile": "prototype-mobile",
  "prototype-admin": "prototype-admin",
  prototype: "prototype",
};

export function resolvePrototypeTemplate(template?: string): string {
  if (!template?.trim()) {
    return "prototype";
  }

  const normalized = template.trim().toLowerCase();
  const resolved = prototypeTemplateAliases[normalized];
  if (!resolved) {
    throw ValidationError.invalidInput(
      "template",
      "不支持的原型模板，请使用 web、mobile、admin、prototype-mobile 或 prototype-admin"
    );
  }
  return resolved;
}

export function formatPrototypeList(prototypes: string[]): string {
  if (prototypes.length === 0) {
    return chalk.yellow("未找到任何原型");
  }

  return prototypes.map((name, index) => `${chalk.cyan(`${index + 1}.`)} ${name}`).join("\n");
}

export function outputJson(value: unknown): void {
  console.log(`${JSON.stringify(value, null, 2)}\n`);
}

export async function resolveCheckpointContext(): Promise<{ projectRoot: string; prototypesDir: string }> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw ConfigError.projectNotInitialized();
  }

  const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
  if (!existsSync(prototypesDir)) {
    throw FileSystemError.directoryNotFound(prototypesDir);
  }

  return { projectRoot, prototypesDir };
}

export function ensurePrototypeExists(prototypesDir: string, prototypePath: string): void {
  const target = path.join(prototypesDir, prototypePath);
  if (!existsSync(target)) {
    throw PrototypeError.notFound(prototypePath);
  }
}

export function formatRecord(record: CheckpointRecord, index?: number): string {
  const prefix = index === undefined ? "" : `${chalk.cyan(`${index + 1}.`)} `;
  const message = record.message ? ` ${chalk.gray(`- ${record.message}`)}` : "";
  return `${prefix}${chalk.bold(record.id)} ${chalk.yellow(`[${record.kind}]`)} ${chalk.dim(record.prototypePath)}${message}`;
}

export function formatSummary(summary: CheckpointDiffSummary): string {
  const lines = [
    `${chalk.dim("from:")} ${summary.fromCheckpointId}`,
    `${chalk.dim("to:")} ${summary.toCheckpointId}`,
    `${chalk.dim("files +")} ${summary.addedFiles.length}`,
    `${chalk.dim("files ~")} ${summary.modifiedFiles.length}`,
    `${chalk.dim("files -")} ${summary.deletedFiles.length}`,
    `${chalk.dim("marks +")} ${summary.markAdded.length}`,
    `${chalk.dim("marks ~")} ${summary.markUpdated.length}`,
    `${chalk.dim("marks -")} ${summary.markDeleted.length}`,
  ];
  return lines.join("\n");
}

export function printPathList(label: string, values: string[]): void {
  if (values.length === 0) return;
  console.log(`${chalk.bold(label)} (${values.length})`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}
