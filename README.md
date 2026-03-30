# figma-reader

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-orange.svg)](package.json)

CLI tool that reads Figma design systems via the REST API and produces clean, structured output for AI coding tools.

**Zero npm dependencies.** Uses Node 18+ native `fetch`.

---

## The Problem

You want an AI tool (Claude Code, Cursor, Codex, Windsurf) to build UI components that match your Figma designs. But:

- **Figma MCP** injects raw JSON into your session — a single component is 50k-130k tokens of noise
- **Copy-pasting** from Figma is manual, lossy, and doesn't scale
- **Screenshots alone** lack the structured data AI needs for accurate implementation

## The Solution

figma-reader sits between Figma and your AI tool:

```
Figma REST API ──> figma-reader ──> blueprint.json + screenshot.png ──> AI tool
     (free)          (cheap)              (clean, small)              (your choice)
```

1. Fetches from Figma API — **free** (Personal Access Token)
2. Cleans the data with Claude Sonnet — **~$0.02 per component**
3. Exports a screenshot — **free** (Figma Image API)
4. Outputs structured data — **~96% smaller** than raw Figma JSON

## Commands

| Command | Needs Claude API? | Description |
|---|---|---|
| `init` | No | Create `.figma-reader.json` from a Figma URL, auto-detect project files |
| `browse` | No | Navigate a Figma file: pages, frames, components, styles |
| `extract` | Yes | Fetch a component, clean it into a blueprint + screenshot |
| `audit` | Yes | Compare Figma DLS against your codebase, generate diff report |

## Install

```bash
npm install -g github:Zaelot-Inc/figma-reader

# Or with pnpm
pnpm add -g github:Zaelot-Inc/figma-reader
```

### Run without installing

```bash
npx github:Zaelot-Inc/figma-reader --help
```

## Authentication

Tokens can be passed via CLI flags or environment variables. Flags take priority.

```bash
# Via flags
figma-reader browse --figma-token figd_xxx
figma-reader extract --node-id 1:3595 --figma-token figd_xxx --anthropic-key sk-ant-xxx

# Via env vars
export FIGMA_TOKEN=figd_xxx
export ANTHROPIC_API_KEY=sk-ant-xxx
```

### Figma token

Create one at **Figma > Settings > Personal Access Tokens > Generate**.

The token only needs **read-only** access:

| Scope | Permission | Why |
|---|---|---|
| **File content** | Read only | Read node trees, pages, frames |
| **File metadata** | Read only | File name, last modified date |

No write permissions are needed. figma-reader never modifies your Figma files.

### Anthropic API key

Get one at [console.anthropic.com](https://console.anthropic.com/). Only required for `extract` and `audit` commands. The `init` and `browse` commands work with just the Figma token.

## Quick start

```bash
# 1. Init config from a Figma URL (auto-detects your project's design system files)
figma-reader init --url "https://www.figma.com/design/ABC123/My-DLS?node-id=1-2"

# 2. Browse the Figma file
figma-reader browse                    # list pages
figma-reader browse --node-id 1:9133   # drill into a section
figma-reader browse --components       # list all component sets

# 3. Extract a component into a blueprint + screenshot
figma-reader extract --node-id 1:3595

# 4. Audit the full DLS against your codebase
figma-reader audit
```

## Usage

### `init`

Creates a `.figma-reader.json` config file. Parses the Figma URL, fetches file metadata, and scans your project for design system files (colors, typography, components).

```bash
figma-reader init --url "https://www.figma.com/design/FILE_KEY/Name?node-id=1-2"
figma-reader init --file-key FILE_KEY --node-id 1:2
```

### `browse`

Navigate a Figma file from the terminal. Shows node IDs you can copy directly into `extract` or `audit`.

```bash
figma-reader browse                          # List pages
figma-reader browse --node-id 1:2            # Drill into a page/frame
figma-reader browse --node-id 1:9133         # Drill into a section
figma-reader browse --components             # List all published component sets
figma-reader browse --styles                 # List all published styles
```

Example output:

```
File: My Design System
Last modified: 2025-01-15T10:30:00Z

Pages:
──────────────────────────────────────────────────────────────────────
  0:1          Cover (1 top-level nodes)
  1:2          Components (31 top-level nodes)
                 1:9133       [SECTION]  Atoms (43)
                 1:9134       [SECTION]  Molecules (28)
                 1:9407       [SECTION]  Components (57)
```

### `extract`

Fetches a Figma component, cleans the raw JSON into a structured blueprint using Claude, and exports a rendered screenshot.

```bash
figma-reader extract --node-id 1:3595
figma-reader extract --node-id 1:3595 --name "MyButton"
```

Output in `.figma-reader/<component>/`:

| File | Description |
|---|---|
| `blueprint.json` | Clean component spec — layout, styles, children, variants |
| `screenshot.png` | Rendered image of the component from Figma |
| `raw.json` | Original Figma node data (for debugging) |

### `audit`

Compares a Figma DLS against your codebase's design tokens, typography, and components. Generates a detailed markdown report.

```bash
figma-reader audit
figma-reader audit --node-id 1:9407 --source ./src
```

The report includes:
- Color audit — Figma vs repo constants, mismatches, missing tokens
- Typography audit — font sizes, weights, line heights
- Component inventory — matched, missing, extra, naming inconsistencies
- Spacing analysis
- Overall alignment score + prioritized recommendations

## Config file

Place `.figma-reader.json` in your project root (or run `init` to generate it):

```json
{
  "fileKey": "your-figma-file-key",
  "nodeId": "1:9407",
  "sourceRoot": "./src",
  "outDir": ".figma-reader",
  "claudeModel": "claude-sonnet-4-6",
  "files": {
    "Colors": "constants/theme.js",
    "Typography": "constants/styles.js"
  },
  "directories": {
    "Components": "components/",
    "Screen Components": "screens/components/"
  }
}
```

| Field | Description |
|---|---|
| `fileKey` | Figma file key (from the URL) |
| `nodeId` | Default node ID for audit (usually the DLS root) |
| `sourceRoot` | Path to your source code root |
| `outDir` | Where to write output files |
| `claudeModel` | Claude model for extract/audit |
| `files` | Map of label → relative path for design system files |
| `directories` | Map of label → relative path for component directories |

## Blueprint format

The `blueprint.json` is framework-agnostic. It uses flexbox layout, hex colors, and pixel values that map to any UI framework — React, React Native, Vue, SwiftUI, Jetpack Compose, Flutter.

```json
{
  "name": "Buttons",
  "description": "Multi-variant button supporting fill, stroke, and text styles",
  "type": "component_set",
  "variants": [
    { "name": "Enabled=on, Type=Fill, Size=big", "props": { "enabled": "on", "type": "Fill", "size": "big" } }
  ],
  "layout": {
    "type": "flex",
    "direction": "row",
    "padding": { "top": 8, "right": 16, "bottom": 8, "left": 16 },
    "gap": 8
  },
  "styles": {
    "backgroundColor": "#E9E9E9",
    "borderRadius": 50
  },
  "children": [
    {
      "type": "text",
      "name": "label",
      "styles": { "color": "#3259B8", "fontSize": 16, "fontWeight": "400" }
    }
  ],
  "variantStyles": {
    "Fill_on": { "backgroundColor": "#E9E9E9", "labelColor": "#3259B8" },
    "Stroke_on": { "borderColor": "#3259B8", "labelColor": "#3259B8" }
  }
}
```

## Using with AI coding tools

The workflow is always the same:

```
1. figma-reader extract --node-id <id>     →  blueprint.json + screenshot.png
2. Give both files to your AI tool
3. AI reads the structured spec + sees the visual reference
4. AI generates code matching the design
```

### Claude Code

```bash
figma-reader extract --node-id 1:3595

# Then ask Claude Code:
# "Read .figma-reader/buttons/blueprint.json and .figma-reader/buttons/screenshot.png
#  and build this as a React Native component in src/components/Button/"
```

Custom slash command (`.claude/commands/figma-build.md`):

```markdown
---
name: figma-build
description: Build a component from a Figma blueprint
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---
<steps>
1. Ask the user for the Figma node ID (from the URL).
2. Run: `figma-reader extract --node-id "<node-id>"`
3. Read the blueprint: `.figma-reader/<component>/blueprint.json`
4. View the screenshot: `.figma-reader/<component>/screenshot.png`
5. Read the existing design system files (colors, typography) to map tokens.
6. Generate the component following the project's conventions.
</steps>
```

### Cursor

```bash
figma-reader extract --node-id 1:3595
```

In Cursor chat:
```
@.figma-reader/buttons/blueprint.json @.figma-reader/buttons/screenshot.png
Build this component as a React component in src/components/Button.tsx
using our existing design tokens from src/theme/colors.ts
```

Cursor rule (`.cursor/rules`):
```
When building components from Figma blueprints (.figma-reader/*/blueprint.json):
- Always map colors to existing design tokens, never hardcode hex values
- Use the screenshot as visual reference for layout accuracy
- Implement all variants listed in the blueprint as component props
```

### Codex (OpenAI)

```bash
figma-reader extract --node-id 1:3595
```

```
Read .figma-reader/buttons/blueprint.json and .figma-reader/buttons/screenshot.png.
Build a React component matching this Figma blueprint.
Use the design tokens from src/theme/colors.ts.
Implement all 12 variants as props (enabled, type, size).
```

### Windsurf

```bash
figma-reader extract --node-id 1:3595
```

```
@.figma-reader/buttons/blueprint.json @.figma-reader/buttons/screenshot.png
Implement this button component with all variants.
Follow our existing component patterns in src/components/.
```

### CI/CD — automated design drift detection

```yaml
# .github/workflows/design-audit.yml
name: Design System Audit
on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9am
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install figma-reader
        run: npm install -g github:Zaelot-Inc/figma-reader
      - name: Run audit
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: figma-reader audit
      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: design-audit
          path: .figma-reader/audit-*.md
```

## All options

| Flag | Description | Default |
|---|---|---|
| `--file-key KEY` | Figma file key | from config |
| `--node-id ID` | Node ID (supports `1-234` and `1:234`) | from config |
| `--url URL` | Figma URL (init/browse) | — |
| `--name NAME` | Override component name (extract) | from Figma |
| `--depth N` | Node tree depth | 10 (extract), 6 (audit), 2 (browse) |
| `--out DIR` | Output directory | `.figma-reader/` |
| `--source DIR` | Codebase source root (audit) | `.` |
| `--model MODEL` | Claude model | `claude-sonnet-4-6` |
| `--figma-token T` | Figma PAT | `FIGMA_TOKEN` env var |
| `--anthropic-key K` | Anthropic API key | `ANTHROPIC_API_KEY` env var |
| `--components` | List published components (browse) | — |
| `--styles` | List published styles (browse) | — |

## Data privacy and third-party services

figma-reader accesses your Figma files through the official [Figma REST API](https://www.figma.com/developers/api) using a Personal Access Token that you provide. The tool only requests **read-only** scopes (`file_content:read`, `file_metadata:read`) and never modifies your Figma files.

When you use `extract` or `audit`, design data from your Figma files may be sent to the [Anthropic API](https://www.anthropic.com/api) (Claude) for processing. This happens in two cases:

- **`extract`** (default): only unresolved node names are sent to Claude Haiku. If no names need resolution, no data is sent.
- **`extract --ai full`** and **`audit`**: the component structure or design token data is sent to Claude Sonnet for analysis.

Anthropic does not use API inputs to train models. See [Anthropic's privacy policy](https://www.anthropic.com/privacy) for details.

**Important:**

- You are responsible for ensuring you have permission to access and process the Figma files you use with this tool.
- Do not use this tool on Figma files that contain confidential or sensitive information unless you are authorized to send that data to third-party APIs.
- figma-reader does not store, cache, or log any Figma data beyond writing the output files to your local disk.
- Output files (`blueprint.json`, `screenshot.png`, `raw.json`) are written locally and never uploaded anywhere.

Review the [Figma Developer Terms](https://www.figma.com/legal/developer-terms) and [Figma Terms of Service](https://www.figma.com/legal/tos/) for applicable restrictions on API usage.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Clone
git clone https://github.com/Zaelot-Inc/figma-reader.git
cd figma-reader

# Run locally
node bin/cli.mjs --help

# Test with a Figma file
export FIGMA_TOKEN=your-token
node bin/cli.mjs browse --file-key your-file-key
```

The project has zero dependencies by design. Please don't add npm packages — use Node built-ins (`fetch`, `fs`, `path`, `readline`, `crypto`).

## License

[MIT](LICENSE)

---

Built by [Zaelot](https://github.com/Zaelot-Inc).
