import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CycleService } from '../../core/cycle.service';
import { fmtMonthShort, fmtShort } from '../../core/date';
import { MOODS, SYMPTOMS } from '../../core/models';

/** Estadísticas de ciclos: medias, variabilidad, historial y tendencias. */
@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Statistics {
  private readonly cycle = inject(CycleService);
  readonly insights = this.cycle.insights;

  readonly cycleBars = computed(() => {
    const cycles = [...this.insights().recentCycles].reverse(); // cronológico
    const max = Math.max(...cycles.map((c) => c.cycleLength ?? 0), 45);
    return cycles.map((c) => ({
      label: fmtMonthShort(c.start),
      value: c.cycleLength ?? 0,
      pct: c.cycleLength ? Math.round(((c.cycleLength ?? 0) / max) * 100) : 0,
      title: c.cycleLength
        ? `${c.cycleLength} días · desde ${fmtShort(c.start)}`
        : 'Primer ciclo registrado',
    }));
  });

  readonly periodBars = computed(() => {
    const cycles = [...this.insights().recentCycles].reverse();
    const max = Math.max(...cycles.map((c) => c.periodDays ?? 0), 8);
    return cycles.map((c) => ({
      label: fmtMonthShort(c.start),
      value: c.periodDays ?? 0,
      pct: c.periodDays ? Math.round(((c.periodDays ?? 0) / max) * 100) : 0,
      title: c.periodDays ? `${c.periodDays} días de sangrado` : 'Sin sangrado registrado',
    }));
  });

  readonly symptomTrend = computed(() => {
    const logs = Object.values(this.cycle.logs());
    const counts = new Map<string, number>();
    for (const l of logs) {
      for (const s of l.symptoms) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const total = logs.length || 1;
    return SYMPTOMS.map((s) => ({
      ...s,
      count: counts.get(s.id) ?? 0,
      pct: Math.round(((counts.get(s.id) ?? 0) / total) * 100),
    }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  });

  readonly moodTrend = computed(() => {
    const logs = Object.values(this.cycle.logs());
    const counts = new Map<string, number>();
    for (const l of logs) {
      if (l.mood) counts.set(l.mood, (counts.get(l.mood) ?? 0) + 1);
    }
    const total = logs.reduce((acc, l) => acc + (l.mood ? 1 : 0), 0) || 1;
    return MOODS.map((m) => ({
      ...m,
      count: counts.get(m.id) ?? 0,
      pct: Math.round(((counts.get(m.id) ?? 0) / total) * 100),
    }))
      .filter((m) => m.count > 0)
      .sort((a, b) => b.count - a.count);
  });

  readonly totalLogs = computed(() => Object.keys(this.cycle.logs()).length);

  /** Serie mensual (últimos 6 meses con datos) de ánimo, libido y sueño 0–10. */
  readonly wellbeing = computed(() => {
    const byMonth = new Map<string, { mood: number[]; libido: number[]; sleep: number[] }>();
    for (const l of Object.values(this.cycle.logs())) {
      if (l.moodScale == null && l.libido == null && l.sleep == null) continue;
      const key = l.date.slice(0, 7);
      const m = byMonth.get(key) ?? { mood: [], libido: [], sleep: [] };
      if (l.moodScale != null) m.mood.push(l.moodScale);
      if (l.libido != null) m.libido.push(l.libido);
      if (l.sleep != null) m.sleep.push(l.sleep);
      byMonth.set(key, m);
    }
    const avg = (a: number[]) =>
      a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
    const rows = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, m]) => ({
        key,
        label: fmtMonthShort(key),
        mood: avg(m.mood),
        libido: avg(m.libido),
        sleep: avg(m.sleep),
        moodCount: m.mood.length,
      }));
    // Posición X de cada etiqueta de mes en el viewBox 0 0 300 140.
    return rows.map((r, i) => ({ ...r, labelX: 18 + (i * 264) / Math.max(rows.length - 1, 1) }));
  });

  /** Polilíneas SVG (viewBox 0 0 300 120) de cada métrica del bienestar. */
  readonly wellbeingSeries = computed(() => {
    const rows = this.wellbeing();
    const build = (vals: (number | null)[]) => {
      const pts = rows
        .map((r, i) => {
          const v = vals[i];
          return v == null
            ? null
            : {
                x: 18 + (i * 264) / Math.max(rows.length - 1, 1),
                y: 110 - (v / 10) * 95,
                v,
                label: r.label,
              };
        })
        .filter((p): p is { x: number; y: number; v: number; label: string } => p != null);
      const defined = vals.filter((v): v is number => v != null);
      return {
        points: pts,
        pointsStr: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
        avg: defined.length
          ? (defined.reduce((a, b) => a + b, 0) / defined.length).toFixed(1)
          : null,
      };
    };
    return [
      { name: 'Ánimo', color: '#d05b96', dash: null, ...build(rows.map((r) => r.mood)) },
      { name: 'Libido', color: '#9068bb', dash: null, ...build(rows.map((r) => r.libido)) },
      { name: 'Sueño', color: '#6fa488', dash: '5 4', ...build(rows.map((r) => r.sleep)) },
    ];
  });

  readonly variabilityLabel = computed(() => {
    const v = this.insights().variability;
    if (!v) return 'Sin datos suficientes';
    if (v <= 3) return 'Regular';
    if (v <= 7) return 'Algo variable';
    return 'Irregular';
  });
}
