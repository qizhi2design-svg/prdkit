import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { registerPrdCreate } from "./create.js";
import { registerPrdCheck } from "./check.js";
import { registerPrdList } from "./list.js";
import { registerPrdCheckpoint } from "./checkpoint.js";
import { registerPrdPublish } from "./publish.js";

export function registerPrd(program: Command): void {
  const prd = program.command("prd").description(COPY.prdDescription);

  registerPrdCreate(prd);
  registerPrdCheck(prd);
  registerPrdList(prd);
  registerPrdCheckpoint(prd);
  registerPrdPublish(prd);
}
