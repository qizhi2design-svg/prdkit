import { Command } from "commander";
import { registerReleaseLinkList } from "./link.js";

export function registerRelease(parent: Command): void {
  const release = parent.command("release").description("管理云端 release 链接");

  registerReleaseLinkList(release);
}
