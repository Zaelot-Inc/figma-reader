# figma-reader

Extract and audit Figma design systems using the Figma REST API + Claude API.

Zero npm dependencies. Uses Node 18+ native `fetch`.

## What it does

- **`extract`** — Fetches a Figma component, cleans the raw JSON into a structured blueprint using Claude, and exports a rendered screenshot. Outputs a clean spec ready for any AI coding tool to consume.
- **`audit`** — Compares a Figma DLS (Design Language System) against your codebase's design tokens, typography, and components. Generates a detailed markdown report with gaps, mismatches, and recommendations.

## Why not a Figma MCP?

A Figma MCP injects raw Figma JSON directly into your AI session context. A single component can be 50k–130k tokens of noise. This tool:

1. Fetches from Figma API (free — uses Personal Access Token)
2. Cleans the data with a cheap Claude Sonnet call (~$0.02)
3. Exports a screenshot (free — Figma Image API)
4. Delivers only clean, structured data to your session

**Result: ~96% less data in your context window.**

## Setup

```bash
# Clone
git clone https://github.com/Zaelot-Inc/figma-reader.git
cd figma-reader

# Set env vars
export FIGMA_TOKEN=your-figma-personal-access-token
export ANTHROPIC_API_KEY=your-anthropic-api-key
```

Get a Figma token: **Figma → Settings → Personal Access Tokens → Generate**

## Usage

### Extract a component

```bash
node bin/cli.mjs extract --file-key <FIGMA_FILE_KEY> --node-id <NODE_ID>
```

The node ID comes from the Figma URL: `figma.com/design/FILE_KEY/...?node-id=1-234`
Both `1-234` and `1:234` formats work.

Output in `.figma-reader/<component>/`:
- `blueprint.json` — clean component spec (layout, styles, children, variants)
- `screenshot.png` — rendered image of the component
- `raw.json` — original Figma data (for debugging)

### Audit a design system

```bash
node bin/cli.mjs audit --file-key <FIGMA_FILE_KEY> --node-id <DLS_ROOT_NODE_ID>
```

Output: `.figma-reader/audit-YYYY-MM-DD.md` with:
- Color audit (Figma vs repo, mismatches, missing tokens)
- Typography audit (font sizes, weights, line heights)
- Component inventory (matched, missing, extra)
- Spacing analysis
- Overall alignment score + prioritized recommendations

### With a config file

Create `.figma-reader.json` in your project root:

```json
{
  "fileKey": "1BOAwYqjtfdtPSWUHw42fe",
  "nodeId": "1:9407",
  "sourceRoot": "./src",
  "outDir": ".figma-reader",
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

Then just:

```bash
node bin/cli.mjs audit
node bin/cli.mjs extract --node-id 1:3595
```

## Blueprint format

The `blueprint.json` output is framework-agnostic:

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

Use it with any AI tool or code generator — React, React Native, Vue, SwiftUI, etc.

## Options

| Flag | Description | Default |
|---|---|---|
| `--file-key KEY` | Figma file key | from config |
| `--node-id ID` | Node ID (supports `1-234` and `1:234`) | from config |
| `--name NAME` | Override component name (extract) | from Figma |
| `--depth N` | Node tree depth | 10 (extract), 6 (audit) |
| `--out DIR` | Output directory | `.figma-reader/` |
| `--source DIR` | Codebase source root (audit) | `.` |
| `--model MODEL` | Claude model | `claude-sonnet-4-6` |

## Requirements

- Node.js >= 18 (native fetch)
- `FIGMA_TOKEN` — [Figma Personal Access Token](https://www.figma.com/developers/api#access-tokens)
- `ANTHROPIC_API_KEY` — [Anthropic API key](https://console.anthropic.com/)

## License

MIT
