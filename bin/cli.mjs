#!/usr/bin/env node
/**
 * figma-reader CLI
 *
 * Commands:
 *   init     [--url URL] [--file-key KEY]
 *   browse   [--node-id ID] [--components] [--styles]
 *   extract  --node-id <id> [--file-key KEY] [--name NAME] [--depth N] [--out DIR]
 *   audit    [--node-id <id>] [--file-key KEY] [--out DIR]
 *
 * Environment:
 *   FIGMA_TOKEN        — Figma Personal Access Token (required)
 *   ANTHROPIC_API_KEY  — Anthropic API key (required for extract/audit)
 *
 * Config:
 *   Place a .figma-reader.json in your project root for defaults.
 */

import { createFigmaClient } from "../src/figma.mjs";
import { createClaudeClient } from "../src/claude.mjs";
import { loadConfig, resolveFileKey } from "../src/config.mjs";
import { extract } from "../src/extract.mjs";
import { audit } from "../src/audit.mjs";
import { browse } from "../src/browse.mjs";
import { init } from "../src/init.mjs";

// ── Parse CLI args ────────────────────────────────────────────
function parseArgs(argv) {
  const command = argv[2];
  const args = {};
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--file-key") args.fileKey = argv[++i];
    else if (argv[i] === "--file") args.file = argv[++i];
    else if (argv[i] === "--node-id") args.nodeId = argv[++i];
    else if (argv[i] === "--depth") args.depth = Number(argv[++i]);
    else if (argv[i] === "--out") args.outDir = argv[++i];
    else if (argv[i] === "--name") args.name = argv[++i];
    else if (argv[i] === "--source") args.sourceRoot = argv[++i];
    else if (argv[i] === "--model") args.claudeModel = argv[++i];
    else if (argv[i] === "--url") args.url = argv[++i];
    else if (argv[i] === "--figma-token") args.figmaToken = argv[++i];
    else if (argv[i] === "--anthropic-key") args.anthropicKey = argv[++i];
    else if (argv[i] === "--ai") {
      // --ai or --ai full
      const next = argv[i + 1];
      if (next === "full") { args.ai = "full"; i++; }
      else { args.ai = true; }
    }
    else if (argv[i] === "--components") args.components = true;
    else if (argv[i] === "--styles") args.styles = true;
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    // Positional: treat bare args as URL for init, or node-id for browse
    else if (!argv[i].startsWith("-") && !args._positional) args._positional = argv[i];
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
  figma-reader init    [--url <figma-url>] [--file-key KEY]
  figma-reader browse  [--node-id ID] [--components] [--styles]
  figma-reader extract <figma-url> | --node-id <id> [options]
  figma-reader audit   [options]

Commands:
  init      Create .figma-reader.json config (scans project for design system files)
  browse    Navigate a Figma file: pages, frames, components, styles
  extract   Fetch a Figma component, clean it into a blueprint, export screenshot
  audit     Compare a Figma DLS against your codebase's design system

Options:
  --file-key KEY    Figma file key (or set in .figma-reader.json)
  --file ALIAS      Select a named file key from .figma-reader.json (fileKeys)
  --node-id ID      Figma node ID (supports both 1-234 and 1:234 formats)
  --url URL         Figma URL (init/browse — extracts file key and node ID)
  --name NAME       Override component name (extract only)
  --depth N         Node tree traversal depth (default: 10 extract, 6 audit, 2 browse)
  --out DIR         Output directory (default: .figma-reader/)
  --source DIR      Source root for codebase files (audit only)
  --model MODEL     Claude model (default: claude-sonnet-4-6)
  --figma-token T   Figma Personal Access Token (or set FIGMA_TOKEN env var)
  --anthropic-key K Anthropic API key (or set ANTHROPIC_API_KEY env var)
  --components      List published components (browse only)
  --styles          List published styles (browse only)
  --help, -h        Show this help

Authentication (pick one):
  # Via flags
  figma-reader browse --figma-token figd_xxx
  figma-reader extract --node-id 1:3595 --figma-token figd_xxx --anthropic-key sk-ant-xxx

  # Via env vars
  export FIGMA_TOKEN=figd_xxx ANTHROPIC_API_KEY=sk-ant-xxx

Examples:
  # Initialize config from a Figma URL
  figma-reader init --url "https://www.figma.com/design/ABC123/My-DLS?node-id=1-2"

  # Browse file pages
  figma-reader browse

  # Browse a specific page or frame
  figma-reader browse --node-id 1:2

  # List all published components
  figma-reader browse --components

  # Extract a component (pass the full Figma URL)
  figma-reader extract "https://www.figma.com/design/ABC123/My-DLS?node-id=1-3595"

  # Or use --node-id (file-key from .figma-reader.json)
  figma-reader extract --node-id 1:3595

  # Pick a named file when several are configured (fileKeys in config)
  figma-reader browse --file icons
  figma-reader extract --file icons --node-id 1:42

  # Audit DLS against codebase
  figma-reader audit
`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.command || args.command.startsWith("-")) {
    printUsage();
    process.exit(args.help || args.command === "--help" || args.command === "-h" ? 0 : 1);
  }

  const config = loadConfig();

  // Priority: CLI flags > env vars > config file
  const FIGMA_TOKEN = args.figmaToken || process.env.FIGMA_TOKEN || config.figmaToken;
  const ANTHROPIC_API_KEY = args.anthropicKey || process.env.ANTHROPIC_API_KEY || config.anthropicKey;

  // ── init (always interactive — only CLI flags skip prompts) ──
  if (args.command === "init") {
    const url = args.url || args._positional;
    await init({
      url,
      fileKey: args.fileKey,
      figmaToken: args.figmaToken || undefined,
      anthropicKey: args.anthropicKey || undefined,
      cwd: process.cwd(),
      log,
    });
    return;
  }

  // Claude is required for: audit always, extract --ai full
  // Claude is optional for: extract (used for name resolution with Haiku if available)
  const needsClaude = args.command === "audit" || (args.command === "extract" && args.ai === "full");

  if (!FIGMA_TOKEN) {
    log("Error: FIGMA_TOKEN is required.");
    log("  Pass via --figma-token <token>, set FIGMA_TOKEN env var, or add figmaToken to .figma-reader.json");
    log("  Create one at: Figma > Settings > Personal Access Tokens");
    process.exit(1);
  }
  if (needsClaude && !ANTHROPIC_API_KEY) {
    log(`Error: ANTHROPIC_API_KEY is required for ${args.command}${args.ai ? " --ai" : ""}.`);
    log("  Pass via --anthropic-key <key>, set ANTHROPIC_API_KEY env var, or add anthropicKey to .figma-reader.json");
    process.exit(1);
  }

  const figma = createFigmaClient(FIGMA_TOKEN);

  // ── browse ──
  if (args.command === "browse") {
    const { parseFigmaUrl } = await import("../src/browse.mjs");

    let urlFileKey = null;
    let nodeId = args.nodeId;

    // Support passing a URL as positional arg
    if (args._positional && args._positional.includes("figma.com")) {
      const parsed = parseFigmaUrl(args._positional);
      urlFileKey = parsed.fileKey;
      nodeId = nodeId || parsed.nodeId;
    }

    let fileKey;
    try {
      ({ fileKey } = resolveFileKey({ fileKey: args.fileKey, urlFileKey, alias: args.file }, config));
    } catch (e) {
      log(`Error: ${e.message}`);
      process.exit(1);
    }

    if (!fileKey) {
      log("Error: no Figma file key. Pass --file-key KEY, --file <alias>, a Figma URL, or set fileKey/fileKeys in .figma-reader.json");
      process.exit(1);
    }

    if (nodeId) nodeId = nodeId.replace(/-/g, ":");

    await browse({
      figma,
      fileKey,
      nodeId,
      depth: args.depth || 2,
      components: args.components || false,
      styles: args.styles || false,
      log,
    });
    return;
  }

  // Commands below (extract, audit) need a file key.
  // For extract, a Figma URL (via --url or positional) can supply key + node.
  let urlFileKey = null;
  if (args.command === "extract") {
    const urlInput = args.url || (args._positional && args._positional.includes("figma.com") ? args._positional : null);
    if (urlInput) {
      const { parseFigmaUrl } = await import("../src/browse.mjs");
      const parsed = parseFigmaUrl(urlInput);
      if (parsed.fileKey) urlFileKey = parsed.fileKey;
      if (!args.nodeId && parsed.nodeId) args.nodeId = parsed.nodeId;
    }
  }

  let fileKey, fileAlias;
  try {
    ({ fileKey, alias: fileAlias } = resolveFileKey({ fileKey: args.fileKey, urlFileKey, alias: args.file }, config));
  } catch (e) {
    log(`Error: ${e.message}`);
    process.exit(1);
  }
  const model = args.claudeModel || config.claudeModel;

  if (!fileKey) {
    log("Error: no Figma file key. Pass --file-key KEY, --file <alias>, a Figma URL, or set fileKey/fileKeys in .figma-reader.json");
    process.exit(1);
  }

  const outDir = args.outDir || config.outDir || ".figma-reader";

  // ── extract ──
  if (args.command === "extract") {
    // File key and node ID were already resolved above (incl. from any URL).
    let nodeId = args.nodeId;
    if (!nodeId) {
      log("Error: --node-id is required for extract (or pass a Figma URL with node-id)");
      log("  figma-reader extract --url \"https://www.figma.com/design/KEY/Name?node-id=1-234\"");
      log("  figma-reader extract \"https://www.figma.com/design/KEY/Name?node-id=1-234\"");
      process.exit(1);
    }
    nodeId = nodeId.replace(/-/g, ":");

    // Pick the right Claude client:
    // --ai full → use configured model (Sonnet) for full cleaning
    // --ai or ANTHROPIC_API_KEY available → use Haiku for name resolution only
    // no key → pure deterministic
    let claude = null;
    if (args.ai === "full" && ANTHROPIC_API_KEY) {
      claude = createClaudeClient(ANTHROPIC_API_KEY, { model });
    } else if (ANTHROPIC_API_KEY) {
      claude = createClaudeClient(ANTHROPIC_API_KEY, { model: "claude-haiku-4-5-20251001" });
    }

    const result = await extract({
      figma,
      claude,
      fileKey,
      nodeId,
      outDir,
      // Separate output per file so components from different files don't collide.
      // Uses the alias (e.g. "icons") when available, else the raw file key.
      namespace: fileAlias || fileKey,
      name: args.name,
      depth: args.depth || config.depth?.extract || 10,
      ai: args.ai || false,
      log,
    });

    process.stdout.write(JSON.stringify(result));
    return;
  }

  // ── audit ──
  if (args.command === "audit") {
    let nodeId = args.nodeId || config.nodeId;
    if (!nodeId) {
      log("Error: --node-id is required for audit (or set nodeId in .figma-reader.json)");
      process.exit(1);
    }
    nodeId = nodeId.replace(/-/g, ":");

    const claude = createClaudeClient(ANTHROPIC_API_KEY, { model });
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
    return;
  }

  log(`Unknown command: ${args.command}`);
  log('  Available: init, browse, extract, audit. Run with --help for usage.');
  process.exit(1);
}

main().catch((err) => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
