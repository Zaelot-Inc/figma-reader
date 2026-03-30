/**
 * Deterministic Figma node → blueprint transformer.
 *
 * Converts raw Figma JSON into a clean, structured blueprint
 * without any AI calls. Pure logic.
 */

// ── Color conversion ──────────────────────────────────────────

function rgbaToHex({ r, g, b }) {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

function extractFillColor(node) {
  if (!node.fills || !Array.isArray(node.fills)) return null;
  for (const fill of node.fills) {
    if (fill.type === "SOLID" && fill.visible !== false && fill.color) {
      return rgbaToHex(fill.color);
    }
  }
  return null;
}

function extractFillOpacity(node) {
  if (!node.fills || !Array.isArray(node.fills)) return 1;
  for (const fill of node.fills) {
    if (fill.type === "SOLID" && fill.visible !== false) {
      return fill.opacity ?? fill.color?.a ?? 1;
    }
  }
  return 1;
}

// ── Stroke extraction ─────────────────────────────────────────

function extractStroke(node) {
  if (!node.strokes || node.strokes.length === 0) return { width: 0, color: null };
  const stroke = node.strokes.find((s) => s.type === "SOLID" && s.visible !== false);
  if (!stroke) return { width: 0, color: null };
  return {
    width: node.strokeWeight || 0,
    color: stroke.color ? rgbaToHex(stroke.color) : null,
  };
}

// ── Shadow extraction ─────────────────────────────────────────

function extractShadow(node) {
  if (!node.effects || node.effects.length === 0) return null;
  const shadow = node.effects.find((e) => e.type === "DROP_SHADOW" && e.visible !== false);
  if (!shadow) return null;
  const { r, g, b, a } = shadow.color || {};
  return {
    type: "drop_shadow",
    color: r !== undefined ? `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a ?? 0.25})` : null,
    offset: { x: shadow.offset?.x || 0, y: shadow.offset?.y || 0 },
    radius: shadow.radius || 0,
  };
}

// ── Layout extraction ─────────────────────────────────────────

function extractLayout(node) {
  const isAutoLayout = node.layoutMode && node.layoutMode !== "NONE";

  return {
    type: "flex",
    direction: node.layoutMode === "VERTICAL" ? "column" : "row",
    justify: mapAxisAlign(node.primaryAxisAlignItems),
    align: mapAxisAlign(node.counterAxisAlignItems),
    padding: {
      top: node.paddingTop || 0,
      right: node.paddingRight || 0,
      bottom: node.paddingBottom || 0,
      left: node.paddingLeft || 0,
    },
    gap: node.itemSpacing || 0,
    width: mapSize(node, "width"),
    height: mapSize(node, "height"),
  };
}

function mapAxisAlign(value) {
  switch (value) {
    case "MIN":
      return "flex-start";
    case "CENTER":
      return "center";
    case "MAX":
      return "flex-end";
    case "SPACE_BETWEEN":
      return "space-between";
    default:
      return "flex-start";
  }
}

function mapSize(node, dimension) {
  const sizing = dimension === "width" ? node.layoutSizingHorizontal : node.layoutSizingVertical;
  if (sizing === "FILL") return "fill";
  if (sizing === "HUG") return "auto";
  // Fixed size
  const box = node.absoluteBoundingBox || node.size;
  if (box) {
    return dimension === "width" ? Math.round(box.width) : Math.round(box.height);
  }
  return "auto";
}

// ── Text style extraction ─────────────────────────────────────

function extractTextStyle(node) {
  const s = node.style || {};
  return {
    color: extractFillColor(node),
    opacity: extractFillOpacity(node),
    fontSize: s.fontSize || null,
    fontWeight: s.fontWeight ? String(s.fontWeight) : null,
    fontFamily: s.fontFamily || null,
    lineHeight: s.lineHeightPx || null,
    letterSpacing: s.letterSpacing || 0,
  };
}

// ── Node type classification ──────────────────────────────────

function classifyNode(node) {
  switch (node.type) {
    case "TEXT":
      return "text";
    case "VECTOR":
    case "BOOLEAN_OPERATION":
    case "LINE":
    case "STAR":
    case "ELLIPSE":
    case "REGULAR_POLYGON":
      return "icon";
    case "RECTANGLE":
      // A rectangle with an image fill is an image
      if (node.fills?.some((f) => f.type === "IMAGE")) return "image";
      return "container";
    case "GROUP":
    case "FRAME":
    case "COMPONENT":
    case "INSTANCE":
    case "SECTION":
      return "container";
    default:
      return "container";
  }
}

// ── Semantic name heuristics ──────────────────────────────────

const GENERIC_NAMES = /^(Frame|Group|Rectangle|Vector|Ellipse|Line|Instance|Component)\s*\d*$/i;

/**
 * Try to assign a semantic name deterministically.
 * Returns { name, confident } — confident=false means the name is a guess.
 */
function semanticName(node, index) {
  const name = node.name || "";

  // If the designer named it something meaningful, keep it
  if (!GENERIC_NAMES.test(name) && name.length > 0) {
    return { name: toCamelCase(name), confident: true };
  }

  // Heuristics based on node type and context
  const type = classifyNode(node);

  if (type === "text") {
    const fontSize = node.style?.fontSize || 0;
    const content = node.characters || "";
    // If text has actual content, use it as a hint
    if (content && content.length <= 20 && !/^\s*$/.test(content)) {
      return { name: toCamelCase(content), confident: true };
    }
    if (fontSize >= 20) return { name: "title", confident: true };
    if (fontSize >= 16) return { name: "heading", confident: true };
    if (fontSize >= 14) return { name: "body", confident: true };
    if (fontSize >= 12) return { name: "caption", confident: true };
    return { name: `text${index > 0 ? index : ""}`, confident: false };
  }

  if (type === "icon") {
    return { name: `icon${index > 0 ? index : ""}`, confident: false };
  }

  if (type === "image") {
    return { name: `image${index > 0 ? index : ""}`, confident: true };
  }

  // Container with children — guess is low confidence
  return { name: `container${index > 0 ? index : ""}`, confident: false };
}

function toCamelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("");
}

// ── Variant extraction ────────────────────────────────────────

function extractVariants(node) {
  if (node.type !== "COMPONENT_SET" || !node.children) return [];

  return node.children
    .filter((child) => child.type === "COMPONENT")
    .map((child) => {
      const props = {};
      // Parse "Prop1=Value1, Prop2=Value2" format
      const parts = child.name.split(",").map((p) => p.trim());
      for (const part of parts) {
        const [key, value] = part.split("=").map((s) => s.trim());
        if (key && value) {
          props[toCamelCase(key)] = value;
        }
      }
      return { name: child.name, props };
    });
}

function extractVariantStyles(node) {
  if (node.type !== "COMPONENT_SET" || !node.children) return {};

  const styles = {};
  for (const child of node.children) {
    if (child.type !== "COMPONENT") continue;

    const key = child.name.replace(/,\s*/g, "_").replace(/=/g, "_");
    const bg = extractFillColor(child);
    const stroke = extractStroke(child);

    const variantStyle = {};
    if (bg) variantStyle.backgroundColor = bg;
    if (child.cornerRadius) variantStyle.borderRadius = child.cornerRadius;
    if (stroke.width > 0) {
      variantStyle.borderWidth = stroke.width;
      if (stroke.color) variantStyle.borderColor = stroke.color;
    }

    // Extract text colors from children
    const textNodes = findNodesByType(child, "TEXT");
    if (textNodes.length > 0) {
      const firstTextColor = extractFillColor(textNodes[0]);
      if (firstTextColor) variantStyle.textColor = firstTextColor;
    }

    // Extract icon colors
    const iconNodes = findNodesByType(child, "VECTOR");
    if (iconNodes.length > 0) {
      const iconColor = extractFillColor(iconNodes[0]);
      if (iconColor) variantStyle.iconColor = iconColor;
    }

    // Size from bounding box
    const box = child.absoluteBoundingBox || child.size;
    if (box) {
      variantStyle.width = Math.round(box.width);
      variantStyle.height = Math.round(box.height);
    }

    if (Object.keys(variantStyle).length > 0) {
      styles[key] = variantStyle;
    }
  }

  return styles;
}

function findNodesByType(node, type) {
  const results = [];
  if (node.type === type) results.push(node);
  if (node.children) {
    for (const child of node.children) {
      results.push(...findNodesByType(child, type));
    }
  }
  return results;
}

// ── Child transformation ──────────────────────────────────────

// Collects nodes where deterministic naming failed
const unresolvedNodes = [];

function transformChild(node, index) {
  const type = classifyNode(node);
  const { name, confident } = semanticName(node, index);

  const result = {
    type,
    name,
    layout: extractLayout(node),
    styles: {},
    children: [],
  };

  if (!confident) {
    result._unresolved = true;
    unresolvedNodes.push({ path: name, type, figmaName: node.name, figmaType: node.type, childCount: node.children?.length || 0 });
  }

  // Type-specific extraction
  if (type === "text") {
    result.content = node.characters || "";
    result.styles = extractTextStyle(node);
  } else {
    result.styles = {
      backgroundColor: extractFillColor(node),
      borderRadius: node.cornerRadius || 0,
      ...(() => {
        const s = extractStroke(node);
        return s.width > 0 ? { borderWidth: s.width, borderColor: s.color } : {};
      })(),
      opacity: node.opacity ?? 1,
      shadow: extractShadow(node),
    };
  }

  if (type === "icon") {
    result.styles.color = extractFillColor(node);
    result.figmaName = node.name;
  }

  // Visible flag
  if (node.visible === false) {
    result.visible = false;
  }

  // Recurse into children (but not for text or icon nodes)
  if (type === "container" && node.children) {
    result.children = node.children
      .filter((child) => child.type !== "BOOLEAN_OPERATION" || child.children?.length > 0)
      .map((child, i) => transformChild(child, i));
  }

  return result;
}

// ── Main transform ────────────────────────────────────────────

/**
 * Transform a raw Figma node into a clean blueprint.
 * Pure deterministic logic — no AI calls.
 *
 * Returns { blueprint, unresolved } where unresolved is a list of
 * nodes that got generic names (e.g., "container0", "icon1").
 * Pass unresolved to resolveNames() with a Claude client to fix them.
 *
 * @param {object} node - Raw Figma node from the API
 * @returns {{ blueprint: object, unresolved: Array }}
 */
export function transform(node) {
  // Reset unresolved collector
  unresolvedNodes.length = 0;

  const isComponentSet = node.type === "COMPONENT_SET";
  const baseNode = isComponentSet && node.children?.length > 0 ? node.children[0] : node;

  const blueprint = {
    name: toPascalCase(node.name),
    description: node.description || "",
    type: isComponentSet ? "component_set" : "component",
    variants: extractVariants(node),
    layout: extractLayout(baseNode),
    styles: {
      backgroundColor: extractFillColor(baseNode),
      borderRadius: baseNode.cornerRadius || 0,
      ...(() => {
        const s = extractStroke(baseNode);
        return s.width > 0 ? { borderWidth: s.width, borderColor: s.color } : {};
      })(),
      opacity: baseNode.opacity ?? 1,
      shadow: extractShadow(baseNode),
    },
    children: [],
    figmaMetadata: {
      nodeId: node.id,
      originalName: node.name,
      originalSize: {
        width: Math.round((node.absoluteBoundingBox || node.size || {}).width || 0),
        height: Math.round((node.absoluteBoundingBox || node.size || {}).height || 0),
      },
    },
  };

  if (baseNode.children) {
    blueprint.children = baseNode.children.map((child, i) => transformChild(child, i));
  }

  if (isComponentSet) {
    blueprint.variantStyles = extractVariantStyles(node);
  }

  return { blueprint, unresolved: [...unresolvedNodes] };
}

/**
 * Resolve generic names in a blueprint using Haiku.
 * Only calls the API for the unresolved nodes — minimal tokens.
 *
 * @param {object} blueprint - Blueprint from transform()
 * @param {Array} unresolved - Unresolved nodes from transform()
 * @param {ReturnType<import('./claude.mjs').createClaudeClient>} claude - Claude client (Haiku)
 * @returns {Promise<object>} Blueprint with resolved names
 */
export async function resolveNames(blueprint, unresolved, claude) {
  if (unresolved.length === 0) return blueprint;

  const prompt = `Given a UI component called "${blueprint.name}", rename these generic nodes to semantic names.
Each node has: current name, type, Figma layer name, Figma type, and child count.

Nodes to rename:
${JSON.stringify(unresolved, null, 2)}

Return a JSON object mapping current name → new semantic camelCase name.
Example: {"container0": "headerRow", "icon1": "chevronIcon"}

Only return the JSON object, no explanation.`;

  const mapping = await claude.promptJSON(prompt);

  // Apply the mapping recursively
  function applyNames(node) {
    if (node._unresolved && mapping[node.name]) {
      node.name = mapping[node.name];
      delete node._unresolved;
    }
    if (node.children) {
      for (const child of node.children) {
        applyNames(child);
      }
    }
  }

  applyNames(blueprint);

  // Also clean any remaining _unresolved flags
  function cleanFlags(node) {
    delete node._unresolved;
    if (node.children) {
      for (const child of node.children) {
        cleanFlags(child);
      }
    }
  }
  cleanFlags(blueprint);

  return blueprint;
}

function toPascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}
