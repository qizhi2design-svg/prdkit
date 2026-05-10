import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { registerPrototypeCreate } from "./create.js";
import { registerPrototypeList } from "./list.js";
import { registerPrototypePublish } from "./publish.js";
import { registerPrototypeCheckpoint } from "./checkpoint.js";
import { registerPrototypeMark } from "./mark.js";

export function registerPrototype(program: Command): void {
  const prototype = program.command("prototype").description(COPY.prototypeDescription);

  registerPrototypeCreate(prototype);
  registerPrototypeList(prototype);
  registerPrototypePublish(prototype);
  registerPrototypeCheckpoint(prototype);
  registerPrototypeMark(prototype);
}
