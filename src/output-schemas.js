const schemas = {
  colors: `type ColorsOutput = {
  command: 'colors';
  summary: {
    totalColors: number;
    actionable: number;
    skipped: number;
    totalFiles: number;
    byType: Record<string, number>;
    skippedByContext: Record<string, number>;
  };
  actionable: Record<string, ColorResult[]>;
  skipped: Record<string, ColorResult[]>;
};

type ColorResult = {
  file: string;
  line: number;
  column: number;
  value: string;
  type: string;
  hex: string | null;
  lineText: string;
  context: string;
  contextLabel: string;
  actionable: boolean;
};`,

  tailwind: `type TailwindOutput = {
  command: 'tailwind';
  tailwindVersion: number;
  summary: {
    totalClasses: number;
    totalFiles: number;
    byPrefix: Record<string, number>;
    byColor: Record<string, number>;
    arbitraryValues: number;
    arbitraryWithThemeMatch: number;
  };
  results: Record<string, TailwindResult[]>;
  v4?: {
    themeVars: number;
    utilities: number;
    files: string[];
  };
};

type TailwindResult = {
  file: string;
  line: number;
  column: number;
  value: string;
  prefix: string;
  color: string | null;
  shade: string | null;
  opacity: string | null;
  arbitrary: string | null;
  context: string;
  arbitraryMatch?: { name: string; hex: string; distance: number };
  arbitraryStatus?: 'exact' | 'close';
  suggestion?: string;
};`,

  compare: `type CompareOutput = {
  command: 'compare';
  palette: Record<string, string>;
  threshold: number;
  summary: {
    total: number;
    actionable: number;
    skipped: number;
    byStatus: { exact: number; close: number; unmatched: number };
    actionableByStatus: { exact: number; close: number; unmatched: number };
    skippedByContext: Record<string, number>;
  };
  actionable: {
    exact: CompareResult[];
    close: CompareResult[];
    unmatched: CompareResult[];
  };
  skipped: {
    byContext: Record<string, CompareResult[]>;
  };
};

type CompareResult = {
  file: string;
  line: number;
  column: number;
  value: string;
  type: string;
  hex: string;
  status: 'exact' | 'close' | 'unmatched';
  match: { name: string; hex: string; distance: number } | null;
  context: string;
  contextLabel: string;
  actionable: boolean;
  lineText: string;
  suggestion: string | null;
  nameSuggestion: string | null;
  cssProperty: string | null;
};`,

  patterns: `type PatternsOutput = {
  command: 'patterns';
  summary: {
    totalPatterns: number;
    minCount: number;
    minClasses: number;
    totalLocations: number;
    subsetRelations: number;
  };
  patterns: Pattern[];
  subsetRelations: SubsetRelation[];
  frequentSubsets: { pattern: string; count: number }[];
};

type Pattern = {
  normalized: string;
  classCount: number;
  occurrences: number;
  impactScore: number;
  locations: PatternLocation[];
};

type PatternLocation = {
  file: string;
  line: number;
  column: number;
  original: string;
  context: string;
  source: 'className' | 'cn/clsx';
};

type SubsetRelation = {
  subset: string;
  superset: string;
  subsetCount: number;
  supersetCount: number;
  sharedClasses: string[];
  extraClasses: string[];
};`,
  jsx: `type JsxOutput = {
  command: 'jsx';
  summary: {
    totalFiles: number;
    totalClusters: number;
    exactDuplicates: number;
    structuralDuplicates: number;
    similarPatterns: number;
    minCount: number;
    minDepth: number;
    similarityThreshold: number;
  };
  clusters: JsxCluster[];
};

type JsxCluster = {
  type: 'exact' | 'structural' | 'similar';
  fingerprint: string;
  structure: string;
  occurrences: number;
  files: number;
  depth: number;
  nodeCount: number;
  impactScore: number;
  sharedClasses: string[];
  classVariants: number;
  suggestion: string;
  locations: JsxLocation[];
};

type JsxLocation = {
  file: string;
  line: number;
  tag: string;
  classes: string[];
};`,
  "duplicate-literals": `type DuplicateLiteralsOutput = {
  command: 'duplicate-literals';
  summary: {
    totalFindings: number;
    minOccurrences: number;
    minFiles: number;
    minLength: number;
    kind: 'string' | 'regex' | 'all';
    scannedFiles: number;
    skippedFiles: number;
    totalLocations: number;
  };
  findings: DuplicateLiteral[];
};

type DuplicateLiteral = {
  /** Raw string value, or /pattern/flags for a regex literal */
  value: string;
  kind: 'string' | 'regex';
  occurrences: number;
  files: number;
  /** Where to single-source the literal */
  suggestedSource: {
    file: string;
    line: number;
    reason: 'exported' | 'most-shared' | 'shallowest';
  };
  locations: DuplicateLiteralLocation[];
};

type DuplicateLiteralLocation = {
  file: string;
  line: number;
  column: number;
  /** True when this occurrence is \`export const NAME = <literal>\` */
  exported: boolean;
};`,
};

function getSchema(commandName) {
  return schemas[commandName] || null;
}

module.exports = { getSchema };
