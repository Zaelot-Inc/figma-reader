/**
 * figma-reader init
 *
 * Creates a .figma-reader.json config file by:
 * 1. Parsing a Figma URL to get file key + node ID
 * 2. Fetching file metadata to auto-populate name
 * 3. Scanning the local directory for common design system paths
 */

import { writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { parseFigmaUrl } from "./browse.mjs";

/** Common design system file patterns to look for */
const FILE_PATTERNS = [
  { label: "Colors", paths: ["theme/colors.ts", "theme/colors.js", "constants/colors.ts", "constants/colors.js", "constants/theme.ts", "constants/theme.js", "styles/colors.ts", "styles/colors.js", "tokens/colors.ts", "tokens/colors.js", "design-tokens/colors.ts"] },
  { label: "Typography", paths: ["theme/typography.ts", "theme/typography.js", "theme/fonts.ts", "theme/fonts.js", "constants/typography.ts", "constants/typography.js", "constants/styles.ts", "constants/styles.js", "styles/typography.ts", "tokens/typography.ts"] },
  { label: "Spacing", paths: ["theme/spacing.ts", "theme/spacing.js", "constants/spacing.ts", "constants/spacing.js", "tokens/spacing.ts", "tokens/spacing.js"] },
  { label: "Constants", paths: ["constants/index.ts", "constants/index.js", "constants/constants.ts", "constants/constants.js"] },
];

/** Common component directory patterns */
const DIR_PATTERNS = [
  { label: "Components", paths: ["components", "src/components", "source/components", "app/components", "lib/components"] },
  { label: "Screen Components", paths: ["screens/components", "src/screens/components", "source/screens/components", "pages/components"] },
  { label: "UI Primitives", paths: ["ui", "src/ui", "primitives", "src/primitives"] },
];

/** Common source root patterns */
const SOURCE_ROOTS = ["src", "source", "app", "lib", "."];

function findSourceRoot(cwd) {
  for (const root of SOURCE_ROOTS) {
    if (root === ".") continue;
    if (existsSync(join(cwd, root))) return `./${root}`;
  }
  return ".";
}

function scanFiles(cwd, sourceRoot) {
  const found = {};
  for (const pattern of FILE_PATTERNS) {
    for (const path of pattern.paths) {
      const full = join(cwd, sourceRoot, path);
      if (existsSync(full)) {
        found[pattern.label] = path;
        break;
      }
      // Also check without sourceRoot prefix
      const fullDirect = join(cwd, path);
      if (existsSync(fullDirect)) {
        found[pattern.label] = path;
        break;
      }
    }
  }
  return found;
}

function scanDirs(cwd, sourceRoot) {
  const found = {};
  for (const pattern of DIR_PATTERNS) {
    for (const path of pattern.paths) {
      const full = join(cwd, sourceRoot, path);
      if (existsSync(full)) {
        found[pattern.label] = path;
        break;
      }
      const fullDirect = join(cwd, path);
      if (existsSync(fullDirect)) {
        found[pattern.label] = path;
        break;
      }
    }
  }
  return found;
}

/**
 * Initialize a .figma-reader.json config file.
 *
 * @param {object} options
 * @param {ReturnType<import('./figma.mjs').createFigmaClient>} [options.figma]
 * @param {string} [options.url] - Figma URL to parse
 * @param {string} [options.fileKey] - Direct file key
 * @param {string} [options.nodeId] - Direct node ID
 * @param {string} [options.cwd] - Working directory
 * @param {function} [options.log]
 */
export async function init({ figma, url, fileKey, cwd = process.cwd(), log = () => {} }) {
  const configPath = join(cwd, ".figma-reader.json");

  if (existsSync(configPath)) {
    log("Warning: .figma-reader.json already exists. It will be overwritten.");
  }

  // Parse Figma URL if provided
  if (url) {
    const parsed = parseFigmaUrl(url);
    fileKey = fileKey || parsed.fileKey;
  }

  let fileName = null;
  let pages = [];

  // Fetch file info if we have a figma client and file key
  if (figma && fileKey) {
    log(`Fetching file info from Figma...`);
    try {
      const file = await figma.getFile(fileKey, 1);
      fileName = file.name;
      pages = (file.document?.children || []).map((p) => ({
        id: p.id,
        name: p.name,
        children: p.children?.length || 0,
      }));
      log(`  File: ${fileName}`);
      log(`  Pages: ${pages.length}`);
      for (const p of pages) {
        log(`    ${p.id.padEnd(10)} ${p.name} (${p.children} nodes)`);
      }
    } catch (e) {
      log(`  Warning: could not fetch file info (${e.message})`);
    }
  }

  // Scan local project
  log("Scanning project directory...");
  const sourceRoot = findSourceRoot(cwd);
  log(`  Source root: ${sourceRoot}`);

  const files = scanFiles(cwd, sourceRoot);
  const directories = scanDirs(cwd, sourceRoot);

  if (Object.keys(files).length > 0) {
    log("  Found design system files:");
    for (const [label, path] of Object.entries(files)) {
      log(`    ${label}: ${path}`);
    }
  } else {
    log("  No design system files detected (you can add them manually)");
  }

  if (Object.keys(directories).length > 0) {
    log("  Found component directories:");
    for (const [label, path] of Object.entries(directories)) {
      log(`    ${label}: ${path}`);
    }
  }

  // Build config
  const config = {
    fileKey: fileKey || "your-figma-file-key",
    sourceRoot,
    outDir: ".figma-reader",
    claudeModel: "claude-sonnet-4-6",
    files: Object.keys(files).length > 0 ? files : {
      "Colors": "theme/colors.ts",
      "Typography": "theme/fonts.ts",
    },
    directories: Object.keys(directories).length > 0 ? directories : {
      "Components": "components/",
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  log("");
  log(`Created: ${configPath}`);

  if (fileName) {
    log(`  Figma file: ${fileName}`);
  }

  return config;
}
