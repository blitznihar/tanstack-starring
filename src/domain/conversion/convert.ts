import type { ConversionTable } from "~/schemas/program.js";
import type { PerformanceLevel } from "~/schemas/common.js";

/**
 * Raw → scale → performance level using a conversion table stored per
 * program/subject/year. Cut points are configurable estimates — never hardcode a
 * fixed percentage.
 */

export type ConversionResult = {
  raw: number;
  scale: number;
  level: PerformanceLevel;
};

export function rawToScale(table: ConversionTable, raw: number): number {
  const rows = [...table.rows].sort((a, b) => a.rawMin - b.rawMin);
  for (const row of rows) {
    if (raw >= row.rawMin && raw <= row.rawMax) return row.scale;
  }
  // Clamp out-of-range raw scores to nearest band.
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first && raw < first.rawMin) return first.scale;
  if (last && raw > last.rawMax) return last.scale;
  return first ? first.scale : 0;
}

export function scaleToLevel(table: ConversionTable, scale: number): PerformanceLevel {
  const { approaches, meets, masters } = table.cutPoints;
  if (scale >= masters) return "masters";
  if (scale >= meets) return "meets";
  if (scale >= approaches) return "approaches";
  return "did_not_meet";
}

export function convert(table: ConversionTable, raw: number): ConversionResult {
  const scale = rawToScale(table, raw);
  return { raw, scale, level: scaleToLevel(table, scale) };
}
