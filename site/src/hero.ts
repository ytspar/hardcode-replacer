import { heroColors, type HeroColor } from './data';
import { wait } from './animation';

interface HeroRow {
  wrapper: HTMLElement;
  hexEl: HTMLElement;
  varEl: HTMLElement;
  swatch: HTMLElement;
  arrow: HTMLElement;
  data: HeroColor;
  transformed: boolean;
}

interface TitleWord {
  container: HTMLElement;
  original: HTMLElement;
  replacement: HTMLElement;
  transformed: boolean;
}

let rows: HeroRow[] = [];
let titleWords: TitleWord[] = [];

export function mountHero(container: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'hero';
  section.setAttribute('aria-label', 'Hero');

  // Small accent label at top — like "Kunstgewerbemuseum Zürich / Ausstellung"
  const label = document.createElement('div');
  label.className = 'hero-label';
  const labelLine1 = document.createElement('div');
  labelLine1.className = 'hero-accent-text';
  labelLine1.textContent = 'Hardcode-Replacer';
  const labelLine2 = document.createElement('div');
  labelLine2.className = 'hero-accent-text';
  labelLine2.textContent = 'V2.1.0';
  label.appendChild(labelLine1);
  label.appendChild(labelLine2);
  section.appendChild(label);

  // Massive overlapping title — "hardcode" + "replacer" on same baseline
  // like "der" + "Film" in the poster
  const title = document.createElement('h1');
  title.className = 'hero-title';

  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'hero-title-wrapper';

  const topWord = createTitleWord('hardcode', 'colors', 'hero-title-top');
  const bottomWord = createTitleWord('Replacer', 'Variables', 'hero-title-bottom');

  titleWrapper.appendChild(topWord.container);
  titleWrapper.appendChild(bottomWord.container);
  title.appendChild(titleWrapper);
  section.appendChild(title);

  // Bottom info zone — like the dates/hours at the bottom of the poster
  const bottom = document.createElement('div');
  bottom.className = 'hero-bottom';

  // Tagline in accent color — like the red info text (same structure as hero-label)
  const tagline = document.createElement('div');
  tagline.className = 'hero-tagline';
  const tagline1 = document.createElement('div');
  tagline1.className = 'hero-accent-text';
  tagline1.textContent = 'A CLI tool for finding hardcoded colors and replacing them with variables.';
  const tagline2 = document.createElement('div');
  tagline2.className = 'hero-accent-text';
  tagline2.textContent = 'Especially useful for cleaning up Claude Code generated interfaces.';
  tagline.appendChild(tagline1);
  tagline.appendChild(tagline2);

  // Compact playground
  const playground = document.createElement('div');
  playground.className = 'hero-playground';
  playground.setAttribute('aria-label', 'Color transformation playground');

  for (const color of heroColors) {
    const row = createRow(color);
    playground.appendChild(row.wrapper);
  }

  // Controls
  const controls = document.createElement('div');
  controls.className = 'hero-controls';

  const transformBtn = document.createElement('button');
  transformBtn.className = 'hero-btn hero-btn--primary';
  transformBtn.textContent = 'Transform All';
  transformBtn.addEventListener('click', transformAll);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'hero-btn';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', resetAll);

  controls.appendChild(transformBtn);
  controls.appendChild(resetBtn);

  bottom.appendChild(tagline);
  bottom.appendChild(playground);
  bottom.appendChild(controls);
  section.appendChild(bottom);
  container.appendChild(section);

  // Auto-play hint
  autoPlayHint();
}

function createTitleWord(original: string, replacement: string, className: string): TitleWord {
  const container = document.createElement('span');
  container.className = className;

  const origEl = document.createElement('span');
  origEl.className = 'hero-title-text';
  origEl.textContent = original;

  const replEl = document.createElement('span');
  replEl.className = 'hero-title-text hero-title-text--hidden';
  replEl.textContent = replacement;

  container.appendChild(origEl);
  container.appendChild(replEl);

  const word: TitleWord = { container, original: origEl, replacement: replEl, transformed: false };
  titleWords.push(word);
  return word;
}

async function transformTitleWord(word: TitleWord): Promise<void> {
  if (word.transformed) return;

  word.original.classList.add('hero-title-text--hidden');
  word.replacement.classList.remove('hero-title-text--hidden');
  word.container.classList.add('hero-title--transformed');
  word.transformed = true;
}

function reverseTitleWord(word: TitleWord): void {
  word.replacement.classList.add('hero-title-text--hidden');
  word.original.classList.remove('hero-title-text--hidden');
  word.container.classList.remove('hero-title--transformed');
  word.transformed = false;
}

function createRow(color: HeroColor): HeroRow {
  const wrapper = document.createElement('div');
  wrapper.className = 'hero-row';
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('role', 'button');
  wrapper.setAttribute('aria-label', `${color.hex} transforms to ${color.varRef}`);

  const swatch = document.createElement('div');
  swatch.className = 'hero-row-swatch';
  swatch.style.background = color.displayColor;

  const hexEl = document.createElement('span');
  hexEl.className = 'hero-row-text hero-row-hex';
  hexEl.textContent = color.hex;
  hexEl.style.color = color.displayColor;

  const arrow = document.createElement('span');
  arrow.className = 'hero-row-arrow';
  arrow.textContent = '\u2192';

  const varEl = document.createElement('span');
  varEl.className = 'hero-row-text hero-row-var hero-row-text--hidden';

  const varFunc1 = document.createElement('span');
  varFunc1.className = 'hero-var-func';
  varFunc1.textContent = 'var(';
  const varName = document.createElement('span');
  varName.className = 'hero-var-name';
  varName.textContent = color.varName;
  varName.style.color = color.displayColor;
  const varFunc2 = document.createElement('span');
  varFunc2.className = 'hero-var-func';
  varFunc2.textContent = ')';
  varEl.appendChild(varFunc1);
  varEl.appendChild(varName);
  varEl.appendChild(varFunc2);

  wrapper.appendChild(swatch);
  wrapper.appendChild(hexEl);
  wrapper.appendChild(arrow);
  wrapper.appendChild(varEl);

  const row: HeroRow = { wrapper, hexEl, varEl, swatch, arrow, data: color, transformed: false };
  rows.push(row);

  const toggle = () => {
    if (row.transformed) {
      reverseRow(row);
    } else {
      transformRow(row);
    }
  };

  wrapper.addEventListener('click', toggle);
  wrapper.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  return row;
}

async function transformRow(row: HeroRow): Promise<void> {
  if (row.transformed) return;

  row.hexEl.classList.add('hero-row-text--hidden');
  row.varEl.classList.remove('hero-row-text--hidden');
  row.arrow.classList.add('hero-row-arrow--done');
  row.wrapper.classList.add('hero-row--transformed');
  row.transformed = true;
}

function reverseRow(row: HeroRow): void {
  row.varEl.classList.add('hero-row-text--hidden');
  row.hexEl.classList.remove('hero-row-text--hidden');
  row.arrow.classList.remove('hero-row-arrow--done');
  row.wrapper.classList.remove('hero-row--transformed');
  row.transformed = false;
}

async function transformAll(): Promise<void> {
  // Transform title words first
  for (const word of titleWords) {
    if (!word.transformed) {
      await transformTitleWord(word);
      await wait(200);
    }
  }
  // Then cascade through color rows
  for (const row of rows) {
    if (!row.transformed) {
      await transformRow(row);
      await wait(120);
    }
  }
}

function resetAll(): void {
  for (const word of titleWords) {
    if (word.transformed) reverseTitleWord(word);
  }
  for (const row of rows) {
    if (row.transformed) reverseRow(row);
  }
}

async function autoPlayHint(): Promise<void> {
  await wait(1800);
  if (rows.length > 0 && !rows[0].transformed) {
    await transformRow(rows[0]);
  }
}
