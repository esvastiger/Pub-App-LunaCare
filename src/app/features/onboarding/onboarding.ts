import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs';
import { Router } from '@angular/router';
import { CycleService } from '../../core/cycle.service';
import { fmtLong } from '../../core/date';
import { Icon } from '../../shared/ui';

/**
 * Asistente de configuración inicial (3 pasos):
 * 1. Fecha de inicio del último periodo.
 * 2. Duración estimada del ciclo (slider, 28 por defecto).
 * 3. Duración estimada del sangrado (slider, 5 por defecto).
 */
@Component({
  selector: 'app-onboarding',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './onboarding.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Onboarding {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cycle = inject(CycleService);
  private readonly router = inject(Router);

  readonly step = signal(1);
  readonly busy = signal(false);

  readonly form = this.fb.group({
    lastPeriodStart: this.fb.control('', { validators: [Validators.required, notFuture] }),
    cycleLength: this.fb.control(this.cycle.settings()?.cycleLength ?? 28, {
      validators: [Validators.min(21), Validators.max(45)],
    }),
    periodLength: this.fb.control(this.cycle.settings()?.periodLength ?? 5, {
      validators: [Validators.min(1), Validators.max(10)],
    }),
  });

  private readonly cycleLen$ = toSignal(
    this.form.controls.cycleLength.valueChanges.pipe(
      map(String),
      startWith(String(this.form.controls.cycleLength.value)),
    ),
    { initialValue: String(this.form.controls.cycleLength.value) },
  );
  readonly cycleLength = computed(() => Number(this.cycleLen$()) || 28);

  private readonly periodLen$ = toSignal(
    this.form.controls.periodLength.valueChanges.pipe(
      map(String),
      startWith(String(this.form.controls.periodLength.value)),
    ),
    { initialValue: String(this.form.controls.periodLength.value) },
  );
  readonly periodLength = computed(() => Number(this.periodLen$()) || 5);

  readonly quickDates = [
    { label: 'Hoy', iso: isoOffset(0) },
    { label: 'Ayer', iso: isoOffset(-1) },
    { label: 'Hace 2 días', iso: isoOffset(-2) },
    { label: 'Hace 3 días', iso: isoOffset(-3) },
  ];

  readonly selectedDate = toSignal(this.form.controls.lastPeriodStart.valueChanges, {
    initialValue: this.form.controls.lastPeriodStart.value,
  });

  readonly dateFormatted = computed(() =>
    this.selectedDate() ? fmtLong(this.selectedDate()) : '',
  );
  readonly maxDate = isoOffset(0);

  /** Relleno del track (--pct): 21–45 y 1–10 respectivamente. */
  readonly cyclePct = computed(() => `${((this.cycleLength() - 21) / (45 - 21)) * 100}%`);
  readonly periodPct = computed(() => `${((this.periodLength() - 1) / (10 - 1)) * 100}%`);

  invalid(c: { invalid: boolean; dirty: boolean; touched: boolean }): boolean {
    return c.invalid && (c.dirty || c.touched);
  }

  pickQuick(iso: string): void {
    this.form.controls.lastPeriodStart.setValue(iso);
  }

  cycleHint(len: number): string {
    if (len < 24) return 'Ciclo corto';
    if (len <= 32) return 'Ciclo regular — lo más habitual';
    return 'Ciclo largo';
  }

  periodHint(len: number): string {
    if (len <= 2) return 'Sangrado breve';
    if (len <= 6) return 'Duración habitual';
    return 'Sangrado prolongado';
  }

  next(): void {
    if (this.step() === 1 && this.form.controls.lastPeriodStart.invalid) {
      this.form.controls.lastPeriodStart.markAsTouched();
      return;
    }
    this.step.update((s) => Math.min(s + 1, 3));
  }

  back(): void {
    this.step.update((s) => Math.max(s - 1, 1));
  }

  async finish(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const { lastPeriodStart, cycleLength, periodLength } = this.form.getRawValue();
      this.cycle.updateSettings({
        lastPeriodStart: lastPeriodStart || null,
        cycleLength,
        periodLength,
        onboarded: true,
      });
      await this.router.navigateByUrl('/app');
    } finally {
      this.busy.set(false);
    }
  }
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function notFuture(control: { value: string }): { future: true } | null {
  if (!control.value) return null;
  const today = isoOffset(0);
  return control.value > today ? { future: true } : null;
}
