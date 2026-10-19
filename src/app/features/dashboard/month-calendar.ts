import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CycleService } from '../../core/cycle.service';
import { DayCell } from '../../core/insights';
import { fmtMonthTitle } from '../../core/date';
import { Icon } from '../../shared/ui';

/** Calendario mensual: días de sangrado, fértiles, ovulación y predicción. */
@Component({
  selector: 'app-month-calendar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex items-center justify-between">
      <button
        type="button"
        class="rounded-full p-2 text-plum-400 transition hover:bg-blush-50 hover:text-plum-600"
        (click)="prev()"
        aria-label="Mes anterior"
      >
        <app-icon name="left" class="text-lg" />
      </button>
      <p class="font-display text-base font-bold text-plum-800">{{ monthTitle() }}</p>
      <button
        type="button"
        class="rounded-full p-2 text-plum-400 transition hover:bg-blush-50 hover:text-plum-600"
        (click)="next()"
        aria-label="Mes siguiente"
      >
        <app-icon name="right" class="text-lg" />
      </button>
    </div>

    <div
      class="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-plum-300 uppercase"
    >
      @for (w of weekdays; track w) {
        <span>{{ w }}</span>
      }
    </div>

    <div class="grid grid-cols-7 gap-1.5">
      @for (c of cells(); track $index) {
        @if (!c.inMonth) {
          <span class="aspect-square"></span>
        } @else {
          <button
            type="button"
            [class]="classFor(c)"
            (click)="daySelect.emit(c.date)"
            [attr.aria-label]="'Registrar día ' + c.date"
          >
            {{ c.day }}
            @if (c.logged) {
              <span
                class="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current opacity-70"
              ></span>
            }
          </button>
        }
      }
    </div>

    <div
      class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-bold text-plum-400"
    >
      <span class="flex items-center gap-1.5"
        ><span class="h-3 w-3 rounded-md bg-linear-to-br from-blush-300 to-lilac-400"></span>
        Periodo</span
      >
      <span class="flex items-center gap-1.5"
        ><span
          class="h-3 w-3 rounded-md border-2 border-dashed border-blush-300 bg-blush-50"
        ></span>
        Predicho</span
      >
      <span class="flex items-center gap-1.5"
        ><span class="h-3 w-3 rounded-md bg-lilac-100 ring-1 ring-lilac-200"></span> Fértil</span
      >
      <span class="flex items-center gap-1.5"
        ><span class="h-3 w-3 rounded-md bg-lilac-100 ring-2 ring-lilac-400"></span> Ovulación</span
      >
    </div>
  `,
})
export class MonthCalendar {
  private readonly cycle = inject(CycleService);

  readonly daySelect = output<string>();

  private readonly now = new Date();
  readonly year = signal(this.now.getFullYear());
  readonly month = signal(this.now.getMonth());

  readonly weekdays = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];
  readonly cells = computed(() => this.cycle.buildMonth(this.year(), this.month()));
  readonly monthTitle = computed(() => fmtMonthTitle(this.year(), this.month()));

  prev(): void {
    let m = this.month() - 1;
    let y = this.year();
    if (m < 0) {
      m = 11;
      y--;
    }
    this.month.set(m);
    this.year.set(y);
  }

  next(): void {
    let m = this.month() + 1;
    let y = this.year();
    if (m > 11) {
      m = 0;
      y++;
    }
    this.month.set(m);
    this.year.set(y);
  }

  classFor(c: DayCell): string {
    const base =
      'relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-2xl text-sm font-bold transition select-none';
    if (!c.inMonth) return `${base} pointer-events-none opacity-0`;
    let look = ' text-plum-600 hover:bg-blush-50';
    if (c.state === 'period')
      look = ' bg-linear-to-br from-blush-300 to-lilac-400 text-white shadow-glow';
    else if (c.state === 'predicted')
      look = ' border-2 border-dashed border-blush-300 bg-blush-50/70 text-blush-500';
    else if (c.state === 'fertile' || c.state === 'ovulation')
      look = ` bg-lilac-100 text-lilac-600${c.state === 'ovulation' ? ' ring-2 ring-lilac-400' : ''}`;
    if (c.isToday) look += ' ring-2 ring-plum-700';
    return base + look;
  }
}
