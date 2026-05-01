import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface SelectDirectoryOptions {
  defaultPath?: string;
}

export async function selectDirectory(options: SelectDirectoryOptions = {}): Promise<string | null> {
  switch (process.platform) {
    case "darwin":
      return selectDirectoryMac(options);
    case "win32":
      return selectDirectoryWindows(options);
    default:
      return selectDirectoryLinux(options);
  }
}

async function selectDirectoryMac(options: SelectDirectoryOptions): Promise<string | null> {
  const defaultPath = normalizeDefaultDirectory(options.defaultPath);
  const scriptLines = [
    'set dialogPrompt to "请选择发布目录"',
  ];

  if (defaultPath) {
    const escapedDefaultPath = escapeAppleScriptString(defaultPath);
    scriptLines.push(`set chosenFolder to choose folder with prompt dialogPrompt default location (POSIX file "${escapedDefaultPath}")`);
  } else {
    scriptLines.push('set chosenFolder to choose folder with prompt dialogPrompt');
  }
  scriptLines.push('POSIX path of chosenFolder');

  try {
    const { stdout } = await execFileAsync("osascript", scriptLines.flatMap((line) => ["-e", line]));
    return stdout.trim() || null;
  } catch (error) {
    if (isDialogCanceled(error)) return null;
    throw error;
  }
}

async function selectDirectoryWindows(options: SelectDirectoryOptions): Promise<string | null> {
  const defaultPath = normalizeDefaultDirectory(options.defaultPath);
  const powershellScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "请选择发布目录"
$dialog.ShowNewFolderButton = $true
${defaultPath ? `$dialog.SelectedPath = "${escapePowerShellString(defaultPath)}"` : ""}
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;

  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", powershellScript]);
  return stdout.trim() || null;
}

async function selectDirectoryLinux(options: SelectDirectoryOptions): Promise<string | null> {
  const args = ["--file-selection", "--directory", "--title=请选择发布目录"];
  const defaultPath = normalizeDefaultDirectory(options.defaultPath);
  if (defaultPath) {
    args.push(`--filename=${defaultPath}${path.sep}`);
  }

  try {
    const { stdout } = await execFileAsync("zenity", args);
    return stdout.trim() || null;
  } catch (error) {
    if (isDialogCanceled(error)) return null;
    throw new Error("当前系统未找到可用的目录选择器，请手动输入输出路径");
  }
}

export function normalizeDefaultDirectory(defaultPath?: string): string | undefined {
  if (!defaultPath) return undefined;

  const resolvedPath = path.resolve(defaultPath);
  let candidate = resolvedPath;

  while (!existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return undefined;
    }
    candidate = parent;
  }

  return candidate;
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapePowerShellString(value: string): string {
  return value.replace(/`/g, "``").replace(/"/g, '`"');
}

function isDialogCanceled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("User canceled") || message.includes("(-128)") || message.includes("code 1");
}
