/**
 * Configuration loader.
 * Reads .figma-reader.json from the project root.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_FILE = ".figma-reader.json";

const DEFAULT_CONFIG = {
  fileKey: null,
  // Named file keys: { alias: "FIGMA_FILE_KEY" }. Lets one project read from
  // several Figma files (e.g. "dls", "icons", "marketing").
  fileKeys: {},
  // Which named key to use when none is selected on the CLI. May be an alias
  // present in `fileKeys`, or a raw file key.
  defaultFileKey: null,
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

/**
 * Resolve which Figma file key to use for a command.
 *
 * Precedence:
 *   1. A raw key passed via `--file-key` (`source.fileKey`)
 *   2. A key parsed from a Figma URL (`source.urlFileKey`)
 *   3. A named alias selected via `--file` (`source.alias`)
 *   4. `config.defaultFileKey` (resolved as an alias, else used as a raw key)
 *   5. The legacy single `config.fileKey`
 *   6. The sole entry in `config.fileKeys`, if exactly one is configured
 *
 * @param {object} source
 * @param {string} [source.fileKey]    - Raw key from --file-key
 * @param {string} [source.urlFileKey] - Key parsed from a Figma URL
 * @param {string} [source.alias]      - Alias from --file
 * @param {object} config - Loaded config
 * @returns {{ fileKey: string|null, alias: string|null }}
 * @throws {Error} If an unknown alias is requested, or multiple files are
 *   configured but none was selected.
 */
export function resolveFileKey(source = {}, config = {}) {
  const fileKeys = config.fileKeys && typeof config.fileKeys === "object" ? config.fileKeys : {};
  const aliases = Object.keys(fileKeys);

  // Map a raw key back to its configured alias, if one matches. Lets a key
  // passed via URL or --file-key reuse its friendly name (e.g. for output dirs).
  const aliasFor = (key) => aliases.find((a) => fileKeys[a] === key) || null;

  // 1. Raw key from --file-key always wins.
  if (source.fileKey) return { fileKey: source.fileKey, alias: aliasFor(source.fileKey) };

  // 2. Key parsed from a Figma URL.
  if (source.urlFileKey) return { fileKey: source.urlFileKey, alias: aliasFor(source.urlFileKey) };

  // 3. Explicit alias selection via --file.
  if (source.alias) {
    if (fileKeys[source.alias]) return { fileKey: fileKeys[source.alias], alias: source.alias };
    const available = aliases.length ? aliases.join(", ") : "(none configured)";
    throw new Error(`Unknown file alias "${source.alias}". Available: ${available}`);
  }

  // 4. Configured default — an alias if it matches one, otherwise a raw key.
  if (config.defaultFileKey) {
    if (fileKeys[config.defaultFileKey]) {
      return { fileKey: fileKeys[config.defaultFileKey], alias: config.defaultFileKey };
    }
    return { fileKey: config.defaultFileKey, alias: null };
  }

  // 5. Legacy single key.
  if (config.fileKey) return { fileKey: config.fileKey, alias: null };

  // 6. Exactly one named key — no ambiguity, use it.
  if (aliases.length === 1) return { fileKey: fileKeys[aliases[0]], alias: aliases[0] };

  // 7. Ambiguous: several configured, none chosen.
  if (aliases.length > 1) {
    throw new Error(
      `Multiple Figma files are configured — pick one with --file <alias>. Available: ${aliases.join(", ")}`,
    );
  }

  return { fileKey: null, alias: null };
}
