const fs = require("node:fs");
const { search } = require("../search");

/**
 * Find repeated JSX structural patterns across files.
 *
 * Unlike `patterns` (which finds repeated className strings), this command
 * detects repeated JSX *subtrees* — e.g., a <button><span>...</span></button>
 * pattern used in 5 places with similar classNames but different text content.
 *
 * Approach:
 * 1. Find all TSX/JSX files via ripgrep
 * 2. Read each file and extract JSX element trees (lightweight regex parser)
 * 3. Fingerprint each subtree by structure: tag names + normalized classNames
 * 4. Cluster by exact fingerprint, then by similarity (Jaccard on class sets)
 * 5. Report duplicates ranked by impact
 */
function findJsx(paths, options) {
  const minCount = Number.parseInt(options.minCount, 10) || 2;
  const minDepth = Number.parseInt(options.minDepth, 10) || 1;
  const similarity = Number.parseFloat(options.similarity) || 0.7;
  const searchPaths = paths.length > 0 ? paths : ["."];

  // 1. Find all JSX/TSX files
  const files = findJsxFiles(searchPaths, options);

  if (files.length === 0) {
    if (options.format === "json") {
      console.log(
        JSON.stringify(
          { command: "jsx", summary: { totalFiles: 0, totalClusters: 0 }, clusters: [] },
          null,
          2
        )
      );
    } else {
      console.log("No JSX/TSX files found.");
    }
    return;
  }

  // 2. Parse all files and extract JSX element trees
  const allElements = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const elements = parseJsxElements(content, file);
      allElements.push(...elements);
    } catch {
      // Skip files that can't be read
    }
  }

  // 3. Build subtrees (parent + children groups) and fingerprint them
  const subtrees = buildSubtrees(allElements, minDepth);

  // 4. Cluster by exact fingerprint
  const exactClusters = clusterByFingerprint(subtrees, minCount);

  // 5. Find similar (not identical) clusters
  const similarClusters = findSimilarClusters(
    subtrees,
    exactClusters,
    minCount,
    similarity
  );

  // 6. Merge, filter noise, and sort by impact
  const allClusters = [...exactClusters, ...similarClusters]
    .filter((c) => isActionableCluster(c))
    .sort((a, b) => b.impactScore - a.impactScore);

  if (options.format === "json") {
    outputJson(allClusters, files.length, minCount, minDepth, similarity);
  } else {
    outputText(allClusters, files.length, minCount, minDepth, similarity);
  }
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function findJsxFiles(searchPaths, options) {
  // Use ripgrep to find files containing JSX (faster than walking dirs)
  const results = search("<[A-Z][a-zA-Z]*|<(div|span|button|section|a|p|h[1-6]|input|form|img|ul|ol|li|nav|header|footer|main|article|aside|table|tr|td|th|label|select|textarea)", searchPaths, {
    include: options.include || "*.{tsx,jsx}",
    exclude: options.exclude,
    caseSensitive: true,
  });

  const fileSet = new Set();
  for (const r of results) {
    fileSet.add(r.file);
  }
  return [...fileSet].sort();
}

// ---------------------------------------------------------------------------
// Lightweight JSX parser
// ---------------------------------------------------------------------------

// Matches JSX opening tags: <TagName ...props... > or <TagName ...props... />
// Also captures className value if present
const OPEN_TAG_RE =
  /^(\s*)<([A-Za-z][A-Za-z0-9.]*)([^>]*?)(\/?)>\s*$/;
const CLOSE_TAG_RE = /^\s*<\/([A-Za-z][A-Za-z0-9.]*)>\s*$/;
// Inline element: <tag ...>content</tag> on one line
const INLINE_ELEMENT_RE =
  /^(\s*)<([A-Za-z][A-Za-z0-9.]*)([^>]*)>([^<]*)<\/\2>\s*$/;
const CLASSNAME_STATIC_RE = /className="([^"]*)"/;
const CLASSNAME_TEMPLATE_RE = /className=\{`([^`]*)`\}/;
const CLASSNAME_EXPR_RE = /className=\{([^}]+)\}/;

/**
 * Parse a file into a flat list of JSX elements with nesting info.
 * Uses a line-by-line approach — not a full AST, but sufficient for
 * detecting structural patterns in well-formatted JSX.
 */
function parseJsxElements(content, file) {
  const lines = content.split("\n");
  const elements = [];
  const stack = []; // track nesting: { tag, line, indent, classes }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for closing tags first (may be on same line as content)
    const closeMatch = line.match(CLOSE_TAG_RE);
    if (closeMatch) {
      const tag = closeMatch[1];
      // Pop stack until we find matching open tag
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].tag === tag) {
          stack[j].closeLine = lineNum;
          stack.splice(j, 1);
          break;
        }
      }
      continue;
    }

    // Check for inline elements: <tag ...>content</tag> on one line
    const inlineMatch = line.match(INLINE_ELEMENT_RE);
    if (inlineMatch) {
      const indent = inlineMatch[1].length;
      const tag = inlineMatch[2];
      const attrs = inlineMatch[3];
      const classes = extractClasses(attrs, lines, i);

      const element = {
        file,
        line: lineNum,
        tag,
        classes,
        indent,
        selfClosing: false,
        closeLine: lineNum,
        children: [],
        parentIndex: null,
      };

      // Find parent
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].indent < indent) {
          element.parentIndex = stack[j].elementIndex;
          break;
        }
      }

      element.elementIndex = elements.length;
      elements.push(element);
      continue;
    }

    // Check for opening tags
    const openMatch = line.match(OPEN_TAG_RE);
    if (openMatch) {
      const indent = openMatch[1].length;
      const tag = openMatch[2];
      const attrs = openMatch[3];
      const selfClosing = openMatch[4] === "/";

      // Extract className
      const classes = extractClasses(attrs, lines, i);

      const element = {
        file,
        line: lineNum,
        tag,
        classes,
        indent,
        selfClosing,
        closeLine: selfClosing ? lineNum : null,
        children: [],
        parentIndex: null,
      };

      // Find parent: nearest stack entry with smaller indent
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].indent < indent) {
          element.parentIndex = stack[j].elementIndex;
          break;
        }
      }

      element.elementIndex = elements.length;
      elements.push(element);

      if (!selfClosing) {
        stack.push({ tag, line: lineNum, indent, elementIndex: element.elementIndex });
      }
      continue;
    }

    // Handle multi-line opening tags — look for className in continuation lines
    // and for the closing > or />
    if (stack.length > 0) {
      const lastOpen = stack[stack.length - 1];
      const elem = elements[lastOpen.elementIndex];

      // Check if this line has className (multi-line tag)
      if (!elem.classes) {
        const classes = extractClassesFromLine(line);
        if (classes) {
          elem.classes = classes;
        }
      }
    }
  }

  // Build parent-child relationships
  for (const elem of elements) {
    if (elem.parentIndex !== null && elements[elem.parentIndex]) {
      elements[elem.parentIndex].children.push(elem.elementIndex);
    }
  }

  return elements;
}

/**
 * Extract className value from tag attributes string.
 * Handles static strings, template literals, and expressions.
 */
function extractClasses(attrs, lines, lineIndex) {
  // Check current line attrs
  const staticMatch = attrs.match(CLASSNAME_STATIC_RE);
  if (staticMatch) {
    return normalizeClasses(staticMatch[1]);
  }

  const templateMatch = attrs.match(CLASSNAME_TEMPLATE_RE);
  if (templateMatch) {
    return normalizeTemplateClasses(templateMatch[1]);
  }

  // Check next few lines for multi-line className
  for (let j = 1; j <= 5 && lineIndex + j < lines.length; j++) {
    const nextLine = lines[lineIndex + j];
    const classes = extractClassesFromLine(nextLine);
    if (classes) return classes;

    // Stop if we hit > or /> (end of opening tag)
    if (/^\s*\/?>/.test(nextLine) || />\s*$/.test(nextLine)) {
      break;
    }
  }

  return null;
}

function extractClassesFromLine(line) {
  const staticMatch = line.match(CLASSNAME_STATIC_RE);
  if (staticMatch) return normalizeClasses(staticMatch[1]);

  const templateMatch = line.match(CLASSNAME_TEMPLATE_RE);
  if (templateMatch) return normalizeTemplateClasses(templateMatch[1]);

  // For expression classNames like className={`...`} or className={cn(...)}
  // extract what we can
  const exprMatch = line.match(CLASSNAME_EXPR_RE);
  if (exprMatch) {
    // Try to extract static parts from template literals inside expressions
    const innerTemplate = exprMatch[1].match(/`([^`]*)`/);
    if (innerTemplate) {
      return normalizeTemplateClasses(innerTemplate[1]);
    }
    // Try to extract from cn/clsx string args
    const stringArgs = exprMatch[1].match(/["']([^"']+)["']/g);
    if (stringArgs) {
      const combined = stringArgs.map((s) => s.slice(1, -1)).join(" ");
      return normalizeClasses(combined);
    }
  }

  return null;
}

/**
 * Normalize a class string: sort alphabetically, deduplicate.
 */
function normalizeClasses(classString) {
  if (!classString || !classString.trim()) return null;
  const classes = classString
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  return classes.length > 0 ? classes : null;
}

/**
 * Normalize template literal classes: extract static parts, drop ${...} expressions.
 */
function normalizeTemplateClasses(template) {
  // Remove ${...} expressions and normalize remaining static parts
  const static_ = template.replace(/\$\{[^}]*\}/g, " ").trim();
  return normalizeClasses(static_);
}

// ---------------------------------------------------------------------------
// Subtree extraction & fingerprinting
// ---------------------------------------------------------------------------

/**
 * Build subtrees from parsed elements.
 * A subtree = an element + its direct children (depth 1)
 * or an element + children + grandchildren (depth 2+).
 */
function buildSubtrees(allElements, minDepth) {
  const subtrees = [];

  // Group elements by file
  const byFile = new Map();
  for (const elem of allElements) {
    if (!byFile.has(elem.file)) {
      byFile.set(elem.file, []);
    }
    byFile.get(elem.file).push(elem);
  }

  for (const [file, elements] of byFile) {
    for (const elem of elements) {
      if (elem.children.length === 0) continue; // Leaf nodes aren't interesting

      // Build the subtree structure
      const tree = buildTreeNode(elem, elements, minDepth, 0);
      if (!tree) continue;

      // Calculate depth
      const depth = treeDepth(tree);
      if (depth < minDepth) continue;

      // Generate fingerprint
      const fingerprint = fingerprintTree(tree);
      const classFingerprint = classesFingerprint(tree);

      subtrees.push({
        file,
        line: elem.line,
        tag: elem.tag,
        tree,
        fingerprint,
        classFingerprint,
        depth,
        nodeCount: countNodes(tree),
      });
    }
  }

  return subtrees;
}

function buildTreeNode(elem, allElements, maxDepth, currentDepth) {
  const node = {
    tag: elem.tag,
    classes: elem.classes,
    children: [],
  };

  if (currentDepth < maxDepth + 1 && elem.children.length > 0) {
    for (const childIdx of elem.children) {
      const child = allElements[childIdx];
      if (child) {
        const childNode = buildTreeNode(child, allElements, maxDepth, currentDepth + 1);
        if (childNode) {
          node.children.push(childNode);
        }
      }
    }
  }

  return node;
}

function treeDepth(node) {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(treeDepth));
}

function countNodes(node) {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

/**
 * Structural fingerprint: tag hierarchy only.
 * e.g., "button(span)" or "div(div(Badge,p,div),div(Badge,div))"
 */
function fingerprintTree(node) {
  if (node.children.length === 0) {
    return node.tag;
  }
  const childPrints = node.children.map(fingerprintTree).join(",");
  return `${node.tag}(${childPrints})`;
}

/**
 * Class-aware fingerprint: tag + normalized class pattern.
 * e.g., "button[bg-grey-800 border ...](span[font-retron text-sm ...])"
 */
function classesFingerprint(node) {
  const classPart = node.classes ? `[${node.classes.join(" ")}]` : "";
  if (node.children.length === 0) {
    return `${node.tag}${classPart}`;
  }
  const childPrints = node.children.map(classesFingerprint).join(",");
  return `${node.tag}${classPart}(${childPrints})`;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

/**
 * Cluster subtrees by exact structural fingerprint.
 */
function clusterByFingerprint(subtrees, minCount) {
  const groups = new Map(); // fingerprint -> subtrees[]

  for (const st of subtrees) {
    if (!groups.has(st.fingerprint)) {
      groups.set(st.fingerprint, []);
    }
    groups.get(st.fingerprint).push(st);
  }

  const clusters = [];
  for (const [fingerprint, members] of groups) {
    if (members.length < minCount) continue;

    // Sub-group by class fingerprint to find exact+class matches
    const classClusters = new Map();
    for (const m of members) {
      if (!classClusters.has(m.classFingerprint)) {
        classClusters.set(m.classFingerprint, []);
      }
      classClusters.get(m.classFingerprint).push(m);
    }

    // Report: if all share the same classFingerprint, it's a full duplicate
    // If different classFingerprints, it's a structural duplicate with style variations
    const classVariants = [...classClusters.entries()].filter(
      ([, v]) => v.length >= 1
    );

    const sharedClasses = findSharedClasses(members);

    clusters.push({
      type: classVariants.length === 1 ? "exact" : "structural",
      fingerprint,
      structureDescription: describeStructure(members[0].tree),
      occurrences: members.length,
      files: [...new Set(members.map((m) => m.file))].length,
      depth: members[0].depth,
      nodeCount: members[0].nodeCount,
      impactScore: members.length * members[0].nodeCount * members[0].depth,
      sharedClasses,
      classVariants: classVariants.length,
      locations: members.map((m) => ({
        file: m.file,
        line: m.line,
        tag: m.tag,
        classes: flattenTreeClasses(m.tree),
      })),
      suggestion: generateSuggestion(members[0], members.length, classVariants.length),
    });
  }

  return clusters;
}

/**
 * Find clusters where different fingerprints are structurally similar.
 * Uses Jaccard similarity on the class sets.
 */
function findSimilarClusters(subtrees, existingClusters, minCount, threshold) {
  // Get fingerprints already reported
  const reportedFingerprints = new Set(existingClusters.map((c) => c.fingerprint));

  // Group unreported subtrees by tag (first element)
  const byRootTag = new Map();
  for (const st of subtrees) {
    if (reportedFingerprints.has(st.fingerprint)) continue;
    if (!byRootTag.has(st.tag)) {
      byRootTag.set(st.tag, []);
    }
    byRootTag.get(st.tag).push(st);
  }

  const clusters = [];

  for (const [, group] of byRootTag) {
    if (group.length < minCount) continue;

    // Compare each pair's class sets for similarity
    const merged = [];
    const used = new Set();

    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;

      const cluster = [group[i]];
      used.add(i);

      const aClasses = new Set(flattenTreeClasses(group[i].tree));
      if (aClasses.size === 0) continue;

      for (let j = i + 1; j < group.length; j++) {
        if (used.has(j)) continue;

        const bClasses = new Set(flattenTreeClasses(group[j].tree));
        if (bClasses.size === 0) continue;

        const sim = jaccardSimilarity(aClasses, bClasses);
        if (sim >= threshold) {
          cluster.push(group[j]);
          used.add(j);
        }
      }

      if (cluster.length >= minCount) {
        merged.push(cluster);
      }
    }

    for (const members of merged) {
      const sharedClasses = findSharedClasses(members);
      clusters.push({
        type: "similar",
        fingerprint: members[0].fingerprint,
        structureDescription: describeStructure(members[0].tree),
        occurrences: members.length,
        files: [...new Set(members.map((m) => m.file))].length,
        depth: members[0].depth,
        nodeCount: members[0].nodeCount,
        impactScore:
          members.length * members[0].nodeCount * Math.max(members[0].depth, 1),
        sharedClasses,
        classVariants: members.length,
        locations: members.map((m) => ({
          file: m.file,
          line: m.line,
          tag: m.tag,
          classes: flattenTreeClasses(m.tree),
        })),
        suggestion: generateSuggestion(
          members[0],
          members.length,
          members.length
        ),
      });
    }
  }

  return clusters;
}

function jaccardSimilarity(setA, setB) {
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filter out generic/noisy clusters that aren't actionable.
 * A cluster made entirely of basic HTML tags (div, span, p, etc.) with
 * zero or very few shared classes is just common HTML nesting — not a
 * component extraction candidate.
 */
// All 148 standard HTML element tags from the HTML Living Standard.
// Source: https://github.com/wooorm/html-tag-names (WHATWG spec)
// Any tag NOT in this set is a custom/React component (e.g., Badge, Card).
const HTML_TAGS = new Set([
  "a", "abbr", "acronym", "address", "applet", "area", "article", "aside",
  "audio", "b", "base", "basefont", "bdi", "bdo", "bgsound", "big", "blink",
  "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite",
  "code", "col", "colgroup", "command", "content", "data", "datalist", "dd",
  "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "element",
  "em", "embed", "fieldset", "figcaption", "figure", "font", "footer", "form",
  "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
  "hgroup", "hr", "html", "i", "iframe", "image", "img", "input", "ins",
  "isindex", "kbd", "keygen", "label", "legend", "li", "link", "listing",
  "main", "map", "mark", "marquee", "math", "menu", "menuitem", "meta",
  "meter", "multicol", "nav", "nextid", "nobr", "noembed", "noframes",
  "noscript", "object", "ol", "optgroup", "option", "output", "p", "param",
  "picture", "plaintext", "pre", "progress", "q", "rb", "rbc", "rp", "rt",
  "rtc", "ruby", "s", "samp", "script", "search", "section", "select",
  "shadow", "slot", "small", "source", "spacer", "span", "strike", "strong",
  "style", "sub", "summary", "sup", "svg", "table", "tbody", "td", "template",
  "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "tt",
  "u", "ul", "var", "video", "wbr", "xmp",
]);

function isActionableCluster(cluster) {
  // Exact duplicates with shared classes are always actionable
  if (cluster.type === "exact" && cluster.sharedClasses.length >= 3) {
    return true;
  }

  // Check if fingerprint uses only generic HTML tags
  const tags = cluster.fingerprint.replace(/[(),]/g, " ").trim().split(/\s+/);
  const allGeneric = tags.every((t) => HTML_TAGS.has(t));

  if (allGeneric) {
    // Generic HTML-only structures need meaningful shared classes to be actionable
    if (cluster.type === "structural" && cluster.sharedClasses.length < 3) {
      return false;
    }
    if (cluster.type === "similar" && cluster.sharedClasses.length < 2) {
      return false;
    }
    // Very shallow generic patterns (depth 2, 2 nodes) are too common
    if (cluster.nodeCount <= 2 && cluster.sharedClasses.length < 5) {
      return false;
    }
  }

  return true;
}

function findSharedClasses(members) {
  if (members.length === 0) return [];
  const sets = members.map((m) => new Set(flattenTreeClasses(m.tree)));
  const shared = [...sets[0]].filter((cls) => sets.every((s) => s.has(cls)));
  return shared.sort();
}

function flattenTreeClasses(node) {
  const classes = [];
  if (node.classes) {
    classes.push(...node.classes);
  }
  for (const child of node.children) {
    classes.push(...flattenTreeClasses(child));
  }
  return classes;
}

function describeStructure(node, depth = 0) {
  const indent = "  ".repeat(depth);
  const classPart = node.classes ? ` .${node.classes.slice(0, 3).join(" .")}${node.classes.length > 3 ? " ..." : ""}` : "";
  let desc = `${indent}<${node.tag}${classPart}>`;
  if (node.children.length > 0) {
    desc += "\n";
    for (const child of node.children) {
      desc += describeStructure(child, depth + 1) + "\n";
    }
    desc += `${indent}</${node.tag}>`;
  } else {
    desc += `</${node.tag}>`;
  }
  return desc;
}

function generateSuggestion(representative, count, variants) {
  const tag = representative.tag;
  const depth = representative.depth;

  if (variants === 1) {
    // Exact duplicate — extract as-is
    if (depth >= 2) {
      return `Extract into a reusable component. ${count} identical instances found.`;
    }
    return `Consider extracting into a component or using @apply.`;
  }

  // Structural duplicate with class variations
  return `Extract with props for variations. ${count} instances share the same <${tag}> structure with ${variants} style variants. Use props like \`variant\`, \`active\`, or \`size\` to handle differences.`;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function outputJson(clusters, fileCount, minCount, minDepth, similarity) {
  const output = {
    command: "jsx",
    summary: {
      totalFiles: fileCount,
      totalClusters: clusters.length,
      exactDuplicates: clusters.filter((c) => c.type === "exact").length,
      structuralDuplicates: clusters.filter((c) => c.type === "structural").length,
      similarPatterns: clusters.filter((c) => c.type === "similar").length,
      minCount,
      minDepth,
      similarityThreshold: similarity,
    },
    clusters: clusters.map((c) => ({
      type: c.type,
      fingerprint: c.fingerprint,
      structure: c.structureDescription,
      occurrences: c.occurrences,
      files: c.files,
      depth: c.depth,
      nodeCount: c.nodeCount,
      impactScore: c.impactScore,
      sharedClasses: c.sharedClasses,
      classVariants: c.classVariants,
      suggestion: c.suggestion,
      locations: c.locations,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputText(clusters, fileCount, minCount, minDepth, similarity) {
  if (clusters.length === 0) {
    console.log(
      `\nNo repeated JSX structures found (min ${minCount} occurrences, min depth ${minDepth}).`
    );
    console.log(`Scanned ${fileCount} JSX/TSX files.\n`);
    return;
  }

  const exact = clusters.filter((c) => c.type === "exact");
  const structural = clusters.filter((c) => c.type === "structural");
  const similar = clusters.filter((c) => c.type === "similar");

  console.log("\n=== Repeated JSX Structures ===");
  console.log(`Scanned ${fileCount} files. Found ${clusters.length} clusters.\n`);
  console.log(
    `  Exact duplicates:     ${exact.length} (identical structure + classes)`
  );
  console.log(
    `  Structural duplicates: ${structural.length} (same tags, different classes)`
  );
  console.log(
    `  Similar patterns:     ${similar.length} (same root, ${Math.round(similarity * 100)}%+ class overlap)`
  );
  console.log("");

  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const typeLabel =
      c.type === "exact"
        ? "EXACT"
        : c.type === "structural"
          ? "STRUCTURAL"
          : "SIMILAR";

    console.log(
      `${i + 1}. [${typeLabel}] ${c.occurrences}x across ${c.files} file(s) — impact: ${c.impactScore}`
    );
    console.log(`   Fingerprint: ${c.fingerprint}`);
    console.log("");

    // Show structure
    const structLines = c.structureDescription.split("\n");
    for (const line of structLines) {
      console.log(`   ${line}`);
    }
    console.log("");

    if (c.sharedClasses.length > 0) {
      console.log(`   Shared classes: ${c.sharedClasses.join(", ")}`);
    }
    if (c.classVariants > 1) {
      console.log(`   Style variants: ${c.classVariants}`);
    }
    console.log(`   → ${c.suggestion}`);
    console.log("");

    // Locations
    console.log("   Locations:");
    for (const loc of c.locations) {
      console.log(`     ${loc.file}:${loc.line}`);
    }
    console.log("");
  }

  console.log("TIP: Start with high-impact exact duplicates — they can be extracted as-is.");
  console.log("TIP: Structural duplicates need props to handle class variations.");
  console.log(
    "TIP: Run with --min-depth 2 to find deeper nested patterns.\n"
  );
}

module.exports = { findJsx };
