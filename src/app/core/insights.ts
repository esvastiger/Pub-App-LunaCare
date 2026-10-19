import { DailyLog, FlowLevel, MOOD_SCORES, VaultData } from './models';
import { addDaysISO, diffDays, todayISO } from './date';

/** Ánimo 0–10 de un día: escala explícita si existe, si no derivada del estado cualitativo. */
export function moodScaleFromLog(l: DailyLog | null | undefined): number | null {
  if (!l) return null;
  if (l.moodScale != null) return l.moodScale;
  return l.mood ? (MOOD_SCORES[l.mood] ?? null) : null;
}

export type Phase = 'menstrual' | 'folicular' | 'fertiles' | 'ovulacion' | 'lutea';

export interface CycleRecord {
  start: string;
  /** Días de sangrado registrados en ese ciclo. */
  periodDays: number | null;
  /** Días desde el inicio anterior (null en el primero). */
  cycleLength: number | null;
}

export type DayState = 'period' | 'predicted' | 'fertile' | 'ovulation' | null;

export interface DayCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  flow: FlowLevel | null;
  logged: boolean;
  hasNote: boolean;
  /** Ánimo 0–10 (escala elegida o derivada) para pintar el "pozo" del calendario. */
  moodScale: number | null;
  state: DayState;
}

export interface Insights {
  hasData: boolean;
  periodStarts: string[];
  lastStart: string | null;
  avgCycle: number | null;
  avgPeriod: number | null;
  variability: number;
  cyclesCount: number;
  recentCycles: CycleRecord[];
  nextStart: string | null;
  daysUntilNext: number | null;
  ovulationDate: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  phaseToday: Phase | null;
  cycleDayToday: number | null;
}

export function computeInsights(v: VaultData | null): Insights {
  const out: Insights = {
    hasData: false,
    periodStarts: [],
    lastStart: null,
    avgCycle: null,
    avgPeriod: null,
    variability: 0,
    cyclesCount: 0,
    recentCycles: [],
    nextStart: null,
    daysUntilNext: null,
    ovulationDate: null,
    fertileStart: null,
    fertileEnd: null,
    phaseToday: null,
    cycleDayToday: null,
  };
  if (!v) return out;

  const flowDates = Object.values(v.logs)
    .filter((l) => l.flow !== null)
    .map((l) => l.date)
    .sort();

  // Un "inicio de periodo" es un día con flujo cuyo día anterior no lo tuvo.
  const starts: string[] = [];
  for (let i = 0; i < flowDates.length; i++) {
    if (i === 0 || diffDays(flowDates[i - 1], flowDates[i]) > 1) starts.push(flowDates[i]);
  }
  if (starts.length === 0 && v.settings.lastPeriodStart) starts.push(v.settings.lastPeriodStart);
  if (starts.length === 0) return out;

  out.hasData = true;
  out.periodStarts = starts;
  out.lastStart = starts[starts.length - 1];
  out.cyclesCount = starts.length;

  const diffs: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const d = diffDays(starts[i - 1], starts[i]);
    if (d >= 15 && d <= 60) diffs.push(d);
  }
  const avgCycle = diffs.length
    ? diffs.reduce((a, b) => a + b, 0) / diffs.length
    : v.settings.cycleLength;
  out.avgCycle = Math.round(avgCycle);
  out.variability = diffs.length >= 2 ? Math.round(stddev(diffs) * 10) / 10 : 0;

  const periodLens: number[] = [];
  for (const s of starts) {
    let len = 0;
    let d = s;
    while (v.logs[d]?.flow) {
      len++;
      d = addDaysISO(d, 1);
    }
    if (len > 0) periodLens.push(len);
  }
  out.avgPeriod = periodLens.length
    ? Math.round(periodLens.reduce((a, b) => a + b, 0) / periodLens.length)
    : v.settings.periodLength;

  out.recentCycles = starts
    .map((s, i) => ({
      start: s,
      periodDays: countFlowRun(v.logs, s) || null,
      cycleLength: i > 0 ? diffDays(starts[i - 1], s) : null,
    }))
    .reverse();

  const cycleLen = out.avgCycle || v.settings.cycleLength;
  const next = addDaysISO(out.lastStart, cycleLen);
  out.nextStart = next;

  const today = todayISO();
  out.daysUntilNext = diffDays(today, next);

  const ovu = addDaysISO(next, -14);
  out.ovulationDate = ovu;
  out.fertileStart = addDaysISO(ovu, -4);
  out.fertileEnd = addDaysISO(ovu, 1);

  const cd = diffDays(out.lastStart, today) + 1;
  if (cd >= 1) {
    out.cycleDayToday = cd;
    if (cd <= out.avgPeriod) out.phaseToday = 'menstrual';
    else if (today >= out.fertileStart && today <= out.fertileEnd)
      out.phaseToday = today === ovu ? 'ovulacion' : 'fertiles';
    else if (today > out.fertileEnd && today < next) out.phaseToday = 'lutea';
    else if (today < out.fertileStart) out.phaseToday = 'folicular';
  }
  return out;
}

export function mergeVaults(local: VaultData, remote: VaultData): VaultData {
  const logs: Record<string, DailyLog> = { ...remote.logs };
  for (const [date, l] of Object.entries(local.logs)) {
    const r = logs[date];
    if (!r || l.updatedAt >= r.updatedAt) logs[date] = l;
  }
  const settings = remote.updatedAt > local.updatedAt ? remote.settings : local.settings;
  return { version: 1, settings, logs, updatedAt: Math.max(local.updatedAt, remote.updatedAt) };
}

function countFlowRun(logs: Record<string, DailyLog>, start: string): number {
  let len = 0;
  let d = start;
  while (logs[d]?.flow) {
    len++;
    d = addDaysISO(d, 1);
  }
  return len;
}

function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
