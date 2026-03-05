import { isReducedMotion, wait } from "./animation";
import { type ColorMatch, colorMatches, sampleLines, variables } from "./data";

const MARKER_SPLIT_RE = /(\{\{.*?\}\})/;
const MARKER_MATCH_RE = /^\{\{(.*)\}\}$/;

interface ColorElement {
  match: ColorMatch;
  original: HTMLElement;
  replacement: HTMLElement;
  transformed: boolean;
  wrapper: HTMLElement;
}

const colorElements: ColorElement[] = [];
let connectionsSvg: SVGSVGElement | null = null;
let activeLines: SVGLineElement[] = [];

export function mountDemo(container: HTMLElement): void {
  const section = document.createElement("section");
  section.className = "demo";
  section.setAttribute("aria-label", "Interactive demo");

  const inner = document.createElement("div");
  inner.className = "section-inner";

  const header = document.createElement("div");
  header.className = "section-header";
  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "Interactive Demo";
  header.appendChild(title);

  // Panels container
  const panels = document.createElement("div");
  panels.className = "demo-panels";

  // Left panel: source code
  const leftPanel = createPanel("sample.tsx", buildSourceLines());

  // Right panel: variables
  const rightPanel = createPanel("variables.css", buildVariablesList());

  // Connection lines SVG
  connectionsSvg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );
  connectionsSvg.classList.add("demo-connections");

  panels.appendChild(leftPanel);
  panels.appendChild(connectionsSvg);
  panels.appendChild(rightPanel);

  // Controls
  const controls = document.createElement("div");
  controls.className = "demo-controls";

  const replaceBtn = document.createElement("button");
  replaceBtn.className = "demo-btn demo-btn--primary";
  replaceBtn.textContent = "Replace All";
  replaceBtn.addEventListener("click", replaceAll);

  const resetBtn = document.createElement("button");
  resetBtn.className = "demo-btn";
  resetBtn.textContent = "Reset";
  resetBtn.addEventListener("click", resetAll);

  controls.appendChild(replaceBtn);
  controls.appendChild(resetBtn);

  // Legend
  const legend = document.createElement("div");
  legend.className = "demo-legend";
  const legendItems: [string, string][] = [
    ["var(--green)", "exact match"],
    ["var(--amber)", "close match"],
    ["var(--red)", "unmatched"],
    ["#555", "effect"],
  ];
  for (const [color, label] of legendItems) {
    const item = document.createElement("div");
    item.className = "demo-legend-item";
    const dot = document.createElement("div");
    dot.className = "demo-legend-dot";
    dot.style.background = color.startsWith("var(") ? color : color;
    // Resolve CSS variable colors for legend dots
    if (color === "var(--green)") {
      dot.style.background = "#22c55e";
    } else if (color === "var(--amber)") {
      dot.style.background = "#f59e0b";
    } else if (color === "var(--red)") {
      dot.style.background = "#ef4444";
    } else {
      dot.style.background = color;
    }
    const text = document.createElement("span");
    text.textContent = label;
    item.appendChild(dot);
    item.appendChild(text);
    legend.appendChild(item);
  }

  inner.appendChild(header);
  inner.appendChild(panels);
  inner.appendChild(controls);
  inner.appendChild(legend);
  section.appendChild(inner);
  container.appendChild(section);
}

function createPanel(title: string, body: HTMLElement): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "demo-panel";

  const header = document.createElement("div");
  header.className = "demo-panel-header";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "demo-panel-dot";
    header.appendChild(dot);
  }

  const name = document.createElement("span");
  name.textContent = title;
  header.appendChild(name);

  body.className += " demo-panel-body";

  panel.appendChild(header);
  panel.appendChild(body);
  return panel;
}

function buildSourceLines(): HTMLElement {
  const body = document.createElement("div");
  let colorIndex = 0;

  sampleLines.forEach((lineText, i) => {
    const line = document.createElement("div");
    line.className = "demo-line";

    const num = document.createElement("span");
    num.className = "demo-line-num";
    num.textContent = String(i + 1);

    const content = document.createElement("span");
    content.className = "demo-line-content";

    // Parse {{color}} markers from data
    const parts = lineText.split(MARKER_SPLIT_RE);
    for (const part of parts) {
      const markerMatch = part.match(MARKER_MATCH_RE);
      if (markerMatch) {
        const colorText = markerMatch[1];
        const matchData = colorMatches[colorIndex];
        colorIndex++;

        if (matchData) {
          const el = createColorElement(colorText, matchData);
          content.appendChild(el);
        } else {
          content.appendChild(document.createTextNode(colorText));
        }
      } else {
        content.appendChild(document.createTextNode(part));
      }
    }

    line.appendChild(num);
    line.appendChild(content);
    body.appendChild(line);
  });

  return body;
}

function createColorElement(text: string, match: ColorMatch): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "demo-color";
  wrapper.setAttribute("data-match", match.match);
  wrapper.setAttribute("tabindex", "0");
  wrapper.setAttribute("role", "button");
  wrapper.setAttribute(
    "aria-label",
    `Color ${text}, ${match.match} match${match.replacement ? `, replaceable with ${match.replacement}` : ""}`
  );

  // Swatch
  const swatch = document.createElement("span");
  swatch.className = "demo-color-swatch";
  swatch.style.background = match.displayColor;

  // Original text
  const original = document.createElement("span");
  original.className = "demo-color-text original";
  original.textContent = text;

  // Replacement text
  const replacement = document.createElement("span");
  replacement.className = "demo-color-text replacement var-text hidden";
  replacement.textContent = match.replacement || text;

  wrapper.appendChild(swatch);
  wrapper.appendChild(original);
  wrapper.appendChild(replacement);

  const colorEl: ColorElement = {
    wrapper,
    original,
    replacement,
    match,
    transformed: false,
  };
  colorElements.push(colorEl);

  // Click/keyboard handler
  const toggle = () => {
    if (match.match === "unmatched" || match.match === "effect") {
      return;
    }
    if (colorEl.transformed) {
      reverseTransform(colorEl);
    } else {
      transformColor(colorEl);
    }
  };

  wrapper.addEventListener("click", toggle);
  wrapper.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });

  // Hover: show connection line
  wrapper.addEventListener("mouseenter", () => showConnection(colorEl));
  wrapper.addEventListener("mouseleave", hideConnections);
  wrapper.addEventListener("focus", () => showConnection(colorEl));
  wrapper.addEventListener("blur", hideConnections);

  return wrapper;
}

function buildVariablesList(): HTMLElement {
  const body = document.createElement("div");

  for (const v of variables) {
    const row = document.createElement("div");
    row.className = "demo-var";
    row.setAttribute("data-var", v.name);

    const swatch = document.createElement("div");
    swatch.className = "demo-var-swatch";
    swatch.style.background = v.value;

    const name = document.createElement("span");
    name.className = "demo-var-name";
    name.textContent = v.name;
    name.style.color = v.value;

    const value = document.createElement("span");
    value.className = "demo-var-value";
    value.textContent = v.value;
    value.style.color = v.value;

    row.appendChild(swatch);
    row.appendChild(name);
    row.appendChild(value);
    body.appendChild(row);
  }

  return body;
}

async function transformColor(el: ColorElement): Promise<void> {
  if (el.transformed || !el.match.replacement) {
    return;
  }

  if (!isReducedMotion()) {
    el.original.classList.add("blur-out");
    await wait(300);
  }

  el.original.classList.add("hidden");
  el.original.classList.remove("blur-out");
  el.replacement.classList.remove("hidden");

  if (!isReducedMotion()) {
    el.replacement.classList.add("blur-out");
    el.replacement.offsetWidth; // trigger reflow
    await wait(30);
    el.replacement.classList.remove("blur-out");
  }

  el.wrapper.classList.add("transformed");
  el.transformed = true;
}

function reverseTransform(el: ColorElement): void {
  el.replacement.classList.add("hidden");
  el.original.classList.remove("hidden");
  el.wrapper.classList.remove("transformed");
  el.transformed = false;
}

async function replaceAll(): Promise<void> {
  const exactMatches = colorElements.filter(
    (el) =>
      (el.match.match === "exact" || el.match.match === "close") &&
      !el.transformed
  );

  for (const el of exactMatches) {
    await transformColor(el);
    await wait(200);
  }
}

function resetAll(): void {
  for (const el of colorElements) {
    if (el.transformed) {
      reverseTransform(el);
    }
  }
  hideConnections();
}

function showConnection(colorEl: ColorElement): void {
  if (!(connectionsSvg && colorEl.match.varName)) {
    return;
  }

  hideConnections();

  // Find matching variable row
  const varRow = document.querySelector(
    `[data-var="${colorEl.match.varName}"]`
  );
  if (!varRow) {
    return;
  }

  varRow.classList.add("highlighted");

  const svgRect = connectionsSvg.getBoundingClientRect();
  const srcRect = colorEl.wrapper.getBoundingClientRect();
  const dstRect = varRow.getBoundingClientRect();

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.classList.add("demo-connection-line");
  line.setAttribute("x1", String(srcRect.right - svgRect.left));
  line.setAttribute(
    "y1",
    String(srcRect.top + srcRect.height / 2 - svgRect.top)
  );
  line.setAttribute("x2", String(dstRect.left - svgRect.left));
  line.setAttribute(
    "y2",
    String(dstRect.top + dstRect.height / 2 - svgRect.top)
  );

  connectionsSvg.appendChild(line);
  activeLines.push(line);

  // Trigger reflow then show
  line.getBoundingClientRect();
  line.classList.add("visible");
}

function hideConnections(): void {
  for (const el of document.querySelectorAll(".demo-var.highlighted")) {
    el.classList.remove("highlighted");
  }
  for (const line of activeLines) {
    line.remove();
  }
  activeLines = [];
}
