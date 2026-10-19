import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CycleService } from '../../core/cycle.service';
import { fmtLong, fmtMedium, fmtShort, todayISO } from '../../core/date';
import {
  DIGESTION,
  FLOWS,
  INTENSITIES,
  Intensity,
  MOODS,
  SYMPTOMS,
  hasAnyLogData,
} from '../../core/models';
import { Icon, Modal } from '../../shared/ui';
import { MonthCalendar } from './month-calendar';
import { DailyLogModal } from '../daily-log/daily-log-modal';

const PHASES: Record<string, { label: string; emoji: string; hint: string }> = {
  menstrual: { label: 'Fase menstrual', emoji: '💧', hint: 'Descansa y hidrátate' },
  folicular: { label: 'Fase folicular', emoji: '🌱', hint: 'Tu energía va en aumento' },
  fertiles: { label: 'Ventana fértil', emoji: '🌷', hint: 'Mayor fertilidad estos días' },
  ovulacion: { label: 'Ovulación', emoji: '✨', hint: 'Tu día más fértil' },
  lutea: { label: 'Fase lútea', emoji: '🌙', hint: 'Escucha a tu cuerpo' },
};

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon, Modal, MonthCalendar, DailyLogModal],
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  readonly cycle = inject(CycleService);
  readonly insights = this.cycle.insights;

  readonly logOpen = signal(false);
  readonly editDate = signal(todayISO());
  /** Modal de aviso médico (disclaimer). */
  readonly disclaimerOpen = signal(false);
  readonly todayLong = fmtLong(todayISO());

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 7
      ? 'Buenas noches'
      : h < 13
        ? 'Buenos días'
        : h < 21
          ? 'Buenas tardes'
          : 'Buenas noches';
  });

  readonly todayLog = computed(() => this.cycle.logs()[todayISO()]);

  readonly todaySummary = computed(() => {
    const l = this.todayLog();
    if (!hasAnyLogData(l)) return null;
    const findIntensity = (id: Intensity | null | undefined) =>
      id ? (INTENSITIES.find((o) => o.id === id) ?? null) : null;
    return {
      flow: FLOWS.find((f) => f.id === l!.flow) ?? null,
      pain: findIntensity(l!.pain),
      breast: findIntensity(l!.breast),
      mood: MOODS.find((m) => m.id === l!.mood) ?? null,
      libido: l!.libido,
      sleep: l!.sleep,
      stress: l!.stress,
      bbt: l!.bbt,
      bbtLabel: l!.bbt != null ? String(l!.bbt).replace('.', ',') : null,
      mucus: l!.mucus,
      digestion: l!.digestion,
      digestionLabel: this.digestionLabel(l!.digestion, l!.digestionOther),
      symptoms: l!.symptoms
        .map((id) => {
          const s = SYMPTOMS.find((x) => x.id === id);
          if (!s) return null;
          // "Otros" sustituye su etiqueta genérica por el texto libre del día.
          return id === 'other' && l!.symptomsOther ? { ...s, label: l!.symptomsOther! } : s;
        })
        .filter((s): s is (typeof SYMPTOMS)[number] => !!s),
      note: l!.note,
    };
  });

  readonly phaseMeta = computed(() => {
    const p = this.insights().phaseToday;
    return p ? PHASES[p] : null;
  });

  readonly countdown = computed(() => {
    const d = this.insights().daysUntilNext;
    if (d === null) return 'Registra tu último periodo';
    if (d === 0) return '¡Es hoy!';
    if (d < 0) return `prevista hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'}`;
    return `en ${d} día${d === 1 ? '' : 's'}`;
  });

  readonly cycleProgress = computed(() => {
    const i = this.insights();
    if (!i.cycleDayToday || !i.avgCycle) return 0;
    return Math.min(100, Math.round((i.cycleDayToday / i.avgCycle) * 100));
  });

  readonly recentChips = computed(() => this.insights().recentCycles.slice(0, 3));

  readonly modalTitle = computed(() => `Registrar día · ${fmtLong(this.editDate())}`);

  /** Etiqueta de digestión, respetando el texto libre de "Otros". */
  private digestionLabel(id: string | null | undefined, other: string | undefined): string | null {
    if (!id) return null;
    const item = DIGESTION.find((d) => d.id === id);
    if (!item) return null;
    return id === 'other' && other ? other : item.label;
  }

  openDisclaimer(): void {
    this.disclaimerOpen.set(true);
  }

  // Helpers de formato disponibles para la plantilla.
  readonly todayISO = todayISO;
  fmtMedium(iso: string): string {
    return fmtMedium(iso);
  }
  fmtShort(iso: string): string {
    return fmtShort(iso);
  }

  openDay(date: string): void {
    this.editDate.set(date);
    this.logOpen.set(true);
  }

  closeLog(): void {
    this.logOpen.set(false);
  }

  nextStartFormatted = computed(() => {
    const n = this.insights().nextStart;
    return n ? fmtMedium(n) : '—';
  });

  fertileRangeFormatted = computed(() => {
    const i = this.insights();
    if (!i.fertileStart || !i.fertileEnd) return '—';
    return `${fmtMedium(i.fertileStart)} – ${fmtMedium(i.fertileEnd)}`;
  });
}
