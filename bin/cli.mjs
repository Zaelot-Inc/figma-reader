#!/usr/bin/env node
/**
 * figma-reader CLI
 *
 * Commands:
 *   extract  --node-id <id> [--file-key KEY] [--name NAME] [--depth N] [--out DIR]
 *   audit    [--node-id <id>] [--file-key KEY] [--out DIR]
 *
 * Environment:
 *   FIGMA_TOKEN        — Figma Personal Access Token (required)
 *   ANTHROPIC_API_KEY  — Anthropic API key (required)
 *
 * Config:
 *   Place a .figma-reader.json in your project root for defaults.
 */

import { createFigmaClient } from "../src/figma.mjs";
import { createClaudeClient } from "../src/claude.mjs";
import { loadConfig } from "../src/config.mjs";
import { extract } from "../src/extract.mjs";
import { audit } from "../src/audit.mjs";

// ── Parse CLI args ────────────────────────────────────────────
function parseArgs(argv) {
  const command = argv[2];
  const args = {};
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--file-key") args.fileKey = argv[++i];
    else if (argv[i] === "--node-id") args.nodeId = argv[++i];
    else if (argv[i] === "--depth") args.depth = Number(argv[++i]);
    else if (argv[i] === "--out") args.outDir = argv[++i];
    else if (argv[i] === "--name") args.name = argv[++i];
    else if (argv[i] === "--source") args.sourceRoot = argv[++i];
    else if (argv[i] === "--model") args.claudeModel = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
  }
  return { command, ...args };
}

function log(msg) {
  process.stderr.write(msg + "\n");
}

function printUsage() {
  log(`
figma-reader — Extract and audit Figma design systems

Usage:
  figma-reader extract --node-id <id> [options]
  figma-reader audit   [options]

Commands:
  extract   Fetch a Figma component, clean it into a blueprint, export screenshot
  audit     Compare a Figma DLS against your codebase's design system

Options:
  --file-key KEY    Figma file key (or set in .figma-reader.json)
  --node-id ID      Figma node ID (supports both 1-234 and 1:234 formats)
  --name NAME       Override component name (extract only)
  --depth N         Node tree traversal depth (default: 10 for extract, 6 for audit)
  --out DIR         Output directory (default: .figma-reader/)
  --source DIR      Source root for codebase files (audit only)
  --model MODEL     Claude model to use (default: claude-sonnet-4-6)
  --help, -h        Show this help

Environment:
  FIGMA_TOKEN        Figma Personal Access Token (required)
  ANTHROPIC_API_KEY  Anthropic API key (required)

Config:
  Place a .figma-reader.json in your project root:

  {
    "fileKey": "your-figma-file-key",
    "nodeId": "1:234",
    "sourceRoot": "./src",
    "outDir": ".figma-reader",
    "files": {
      "Colors": "theme/colors.ts",
      "Typography": "theme/fonts.ts"
    },
    "directories": {
      "Components": "components/",
      "Screen Components": "screens/components/"
    }
  }
`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.command || args.command.startsWith("-")) {
    printUsage();
    process.exit(args.help || args.command === "--help" || args.command === "-h" ? 0 : 1);
  }

  // Validate env
  const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!FIGMA_TOKEN) {
    log("Error: FIGMA_TOKEN is required.");
    log("  Create one at: Figma > Settings > Personal Access Tokens");
    process.exit(1);
  }
  if (!ANTHROPIC_API_KEY) {
    log("Error: ANTHROPIC_API_KEY is required.");
    process.exit(1);
  }

  // Load config
  const config = loadConfig();
  const fileKey = args.fileKey || config.fileKey;
  const model = args.claudeModel || config.claudeModel;

  if (!fileKey) {
    log("Error: --file-key is required (or set fileKey in .figma-reader.json)");
    process.exit(1);
  }

  // Create clients
  const figma = createFigmaClient(FIGMA_TOKEN);
  const claude = createClaudeClient(ANTHROPIC_API_KEY, { model });
  const outDir = args.outDir || config.outDir || ".figma-reader";

  // Route command
  if (args.command === "extract") {
    let nodeId = args.nodeId;
    if (!nodeId) {
      log("Error: --node-id is required for extract");
      log("  Copy from Figma URL: node-id=X-Y → use X-Y or X:Y");
      process.exit(1);
    }
    // Convert URL format (1-9407) to API format (1:9407)
    nodeId = nodeId.replace(/-/g, ":");

    const result = await extract({
      figma,
      claude,
      fileKey,
      nodeId,
      outDir,
      name: args.name,
      depth: args.depth || config.depth?.extract || 10,
      log,
    });

    // Output summary to stdout for programmatic use
    process.stdout.write(JSON.stringify(result));
  } else if (args.command === "audit") {
    let nodeId = args.nodeId || config.nodeId;
    if (!nodeId) {
      log("Error: --node-id is required for audit (or set nodeId in .figma-reader.json)");
      process.exit(1);
    }
    nodeId = nodeId.replace(/-/g, ":");

    const reportPath = await audit({
      figma,
      claude,
      fileKey,
      nodeId,
      config: {
        sourceRoot: args.sourceRoot || config.sourceRoot || ".",
        files: config.files || {},
        directories: config.directories || {},
      },
      outDir,
      depth: args.depth || config.depth?.audit || 6,
      log,
    });

    process.stdout.write(reportPath);
  } else {
    log(`Unknown command: ${args.command}`);
    log('  Use "extract" or "audit". Run with --help for usage.');
    process.exit(1);
  }
}

main().catch((err) => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
