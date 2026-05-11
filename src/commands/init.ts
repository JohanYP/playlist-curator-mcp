// `init` command — interactive wizard that writes the config file.
// Phase 0: stub that confirms the layout and prints next steps. Phase 6
// wires the actual interactive prompts (readline-based, no extra deps).

import { logger } from "../utils/logger.js";
import { getPaths } from "../config/paths.js";

export async function runInit(): Promise<void> {
  const paths = getPaths();
  logger.info(`Config will be written to: ${paths.configFile}`);
  logger.info(`History DB will live at  : ${paths.historyDb}`);
  logger.warn(
    "Interactive init not yet implemented (Phase 0 skeleton). For now, create the file manually following docs/CONFIGURATION.md.",
  );
}
