/**
 * figma-reader browse
 *
 * Navigate a Figma file from the CLI: pages → frames → components.
 * Displays node IDs so you can use them with extract/audit.
 */

/**
 * Parse a Figma URL into file key and optional node ID.
 *
 * Supports:
 *   https://www.figma.com/design/FILE_KEY/Name?node-id=1-234
 *   https://www.figma.com/file/FILE_KEY/Name?node-id=1-234
 *   Just a file key string
 */
export function parseFigmaUrl(input) {
  if (!input) return { fileKey: null, nodeId: null };

  // Direct file key (no slashes)
  if (!input.includes("/")) {
    return { fileKey: input, nodeId: null };
  }

  const url = new URL(input);
  const parts = url.pathname.split("/");
  // /design/FILE_KEY/... or /file/FILE_KEY/...
  const keyIndex = parts.findIndex((p) => p === "design" || p === "file");
  const fileKey = keyIndex >= 0 ? parts[keyIndex + 1] : null;

  const nodeIdParam = url.searchParams.get("node-id");
  const nodeId = nodeIdParam ? nodeIdParam.replace(/-/g, ":") : null;

  return { fileKey, nodeId };
}

/**
 * Format a node ID for display (colon format for API use).
 */
function formatNodeId(id) {
  return id || "—";
}

/**
 * Recursively collect nodes of interest from a Figma tree.
 */
function collectNodes(node, depth = 0, maxDepth = 2, results = []) {
  const indent = "  ".repeat(depth);
  const childCount = node.children?.length || 0;
  const isComponent = node.type === "COMPONENT" || node.type === "COMPONENT_SET";

  results.push({
    indent,
    depth,
    id: node.id,
    name: node.name,
    type: node.type,
    childCount,
    isComponent,
    variantCount: node.type === "COMPONENT_SET" ? childCount : 0,
  });

  if (node.children && depth < maxDepth) {
    for (const child of node.children) {
      collectNodes(child, depth + 1, maxDepth, results);
    }
  }

  return results;
}

/**
 * Browse a Figma file and return structured data.
 *
 * @param {object} options
 * @param {ReturnType<import('./figma.mjs').createFigmaClient>} options.figma
 * @param {string} options.fileKey
 * @param {string} [options.nodeId] - If provided, browse children of this node
 * @param {number} [options.depth=2] - How deep to show
 * @param {boolean} [options.components] - List published components only
 * @param {boolean} [options.styles] - List published styles only
 * @param {function} [options.log]
 */
export async function browse({ figma, fileKey, nodeId, depth = 2, components = false, styles = false, log = () => {} }) {
  // Published components list
  if (components) {
    log(`Fetching published components from ${fileKey}...`);
    const comps = await figma.getComponents(fileKey);

    // Group by component set
    const sets = {};
    const standalone = [];
    for (const c of comps) {
      const set = c.containing_frame?.containingComponentSet;
      if (set) {
        if (!sets[set.nodeId]) sets[set.nodeId] = { name: set.name, nodeId: set.nodeId, variants: [] };
        sets[set.nodeId].variants.push(c.name);
      } else {
        standalone.push({ name: c.name, nodeId: c.node_id });
      }
    }

    const sortedSets = Object.values(sets).sort((a, b) => b.variants.length - a.variants.length);

    log("");
    log(`Published components: ${comps.length} total`);
    log("");

    if (sortedSets.length > 0) {
      log("Component Sets (with variants):");
      log("─".repeat(70));
      for (const s of sortedSets) {
        log(`  ${s.nodeId.padEnd(12)} ${s.name} (${s.variants.length} variants)`);
        for (const v of s.variants.slice(0, 8)) {
          log(`${"".padEnd(16)} └ ${v}`);
        }
        if (s.variants.length > 8) {
          log(`${"".padEnd(16)} └ ... and ${s.variants.length - 8} more`);
        }
      }
    }

    if (standalone.length > 0) {
      log("");
      log("Standalone Components:");
      log("─".repeat(70));
      for (const c of standalone) {
        log(`  ${c.nodeId.padEnd(12)} ${c.name}`);
      }
    }

    return { type: "components", count: comps.length, sets: sortedSets, standalone };
  }

  // Published styles list
  if (styles) {
    log(`Fetching published styles from ${fileKey}...`);
    const styleList = await figma.getStyles(fileKey);

    const grouped = {};
    for (const s of styleList) {
      const type = s.style_type || "OTHER";
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(s);
    }

    log("");
    log(`Published styles: ${styleList.length} total`);

    for (const [type, items] of Object.entries(grouped)) {
      log("");
      log(`${type} (${items.length}):`);
      log("─".repeat(70));
      for (const s of items) {
        log(`  ${(s.node_id || "—").padEnd(12)} ${s.name}${s.description ? ` — ${s.description}` : ""}`);
      }
    }

    return { type: "styles", count: styleList.length, grouped };
  }

  // Browse node tree
  if (nodeId) {
    log(`Fetching node ${nodeId} from ${fileKey} (depth: ${depth})...`);
    const node = await figma.getNodes(fileKey, nodeId, depth);
    const nodes = collectNodes(node, 0, depth);

    log("");
    log(`${node.name} (${node.type})`);
    log("─".repeat(70));

    for (const n of nodes) {
      const tag = n.isComponent ? (n.variantCount > 0 ? `[SET:${n.variantCount}]` : "[COMP]") : `[${n.type}]`;
      const childInfo = n.childCount > 0 && !n.isComponent ? ` (${n.childCount} children)` : "";
      log(`${n.indent}${n.id.padEnd(12)} ${tag.padEnd(10)} ${n.name}${childInfo}`);
    }

    return { type: "node", name: node.name, nodeType: node.type, nodes };
  }

  // Top-level: show file pages
  log(`Fetching file ${fileKey}...`);
  const file = await figma.getFile(fileKey, depth);

  log("");
  log(`File: ${file.name}`);
  log(`Last modified: ${file.lastModified}`);
  log("");
  log("Pages:");
  log("─".repeat(70));

  const pages = file.document?.children || [];
  for (const page of pages) {
    const childCount = page.children?.length || 0;
    log(`  ${page.id.padEnd(12)} ${page.name} (${childCount} top-level nodes)`);

    // Show top-level frames of each page
    if (page.children) {
      for (const frame of page.children.slice(0, 15)) {
        const fChildren = frame.children?.length || 0;
        const tag = frame.type === "COMPONENT_SET" ? "[SET]" : frame.type === "COMPONENT" ? "[COMP]" : `[${frame.type}]`;
        log(`${"".padEnd(16)} ${frame.id.padEnd(12)} ${tag.padEnd(10)} ${frame.name}${fChildren ? ` (${fChildren})` : ""}`);
      }
      if (page.children.length > 15) {
        log(`${"".padEnd(16)} ... and ${page.children.length - 15} more`);
      }
    }
    log("");
  }

  return { type: "file", name: file.name, pages: pages.map((p) => ({ id: p.id, name: p.name, children: p.children?.length || 0 })) };
}
