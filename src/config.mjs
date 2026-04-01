/**
 * Configuration loader.
 * Reads .figma-reader.json from the project root.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_FILE = ".figma-reader.json";

const DEFAULT_CONFIG = {
  fileKey: null,
  figmaToken: null,
  anthropicKey: null,
  sourceRoot: ".",
  outDir: ".figma-reader",
  claudeModel: "claude-sonnet-4-6",
  depth: {
    extract: 10,
    audit: 6,
  },
  files: {},
  directories: {},
};

/**
 * Load config from .figma-reader.json, merged with defaults.
 * CLI args override config file values.
 */
export function loadConfig(cwd = process.cwd()) {
  const configPath = join(cwd, CONFIG_FILE);
  let fileConfig = {};

  if (existsSync(configPath)) {
    fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  }

  return { ...DEFAULT_CONFIG, ...fileConfig };
}
