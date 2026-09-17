/** Wire syntax only: neither these records nor compiler caches establish truth. */
export interface LocalSet { cells: number[]; house: string; symbols: number[] }
export interface SdcRoute { sector: "line" | "box"; occurrences: number[]; projection: number; visibility: number[]; root: number }
export interface SdcPattern {
  kind: "sdc"; alias: "Sue de Coq" | "Two-sector disjoint subsets";
  line: string; box: string; intersection: number[]; lineSide: number[]; boxSide: number[];
  domains: number[]; table: number; routes: SdcRoute[];
}
export interface AlignedPattern {
  kind: "aligned"; alias: "Aligned Pair Exclusion" | "Aligned Triple Exclusion" | "Generalized Aligned Exclusion";
  selected: number[]; domains: number[]; auxiliaries: (LocalSet & { domains: number[]; table: number })[];
  /** Lexicographic full Cartesian order. Zero survives; -1-pair is a direct
   * conflict; 1+auxiliary is an empty matching. A survivor has root -1. */
  reasons: number[]; rejections: number[]; roots: number[];
}
export interface CountScope { house: string; cells: number[]; root: number }
export interface CountPattern {
  kind: "count"; alias: "Subset counting"; cells: number[]; domains: number[]; symbols: number[];
  scopes: CountScope[]; target: { cell: number; symbol: number }; capacities: number[];
  assumption: number; contradiction: number; root: number;
}
export type SetPattern = SdcPattern | AlignedPattern | CountPattern;
