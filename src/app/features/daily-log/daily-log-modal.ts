import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CycleService } from '../../core/cycle.service';
import {
  ALCOHOL,
  CERVIX_FIRMNESS,
  CERVIX_HEIGHT,
  CERVIX_OPENING,
  DIGESTION,
  FLOWS,
  INTENSITIES,
  MOODS,
  MOOD_SCORES,
  MUCUS,
  SKIN,
  STRESS,
  AlcoholLevel,
  BBT_MAX,
  BBT_MIN,
  CervicalMucus,
  CervixFirmness,
  CervixHeight,
  CervixOpening,
  DigestionState,
  FlowLevel,
  Intensity,
  SkinState,
  StressLevel,
  SYMPTOMS,
} from '../../core/models';
import { Icon, ToastService } from '../../shared/ui';

/**
 * Registro diario v2: flujo, dolor, ánimo (escala 0–10), libido, sueño,
 * estrés, BBT, moco y cérvix, pecho, digestión, piel, alcohol, medicación,
 * síntomas, cómo te sientes y nota personal. Todo se cifra al guardar.
 */
@Component({
  selector: 'app-daily-log',
  imports: [Icon],
  templateUrl: './daily-log-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyLogModal {
  private readonly cycle = inject(CycleService);
  private readonly toast = inject(ToastService);

  readonly date = input.required<string>();
  readonly saved = output<void>();

  // Catálogos para la plantilla
  readonly flows = FLOWS;
  readonly intensities = INTENSITIES;
  readonly stress = STRESS;
  readonly mucus = MUCUS;
  readonly cervixHeight = CERVIX_HEIGHT;
  readonly cervixOpening = CERVIX_OPENING;
  readonly cervixFirmness = CERVIX_FIRMNESS;
  readonly digestion = DIGESTION;
  readonly skin = SKIN;
  readonly alcohol = ALCOHOL;
  readonly symptoms = SYMPTOMS;
  readonly moods = MOODS;

  readonly bbtMin = BBT_MIN;
  readonly bbtMax = BBT_MAX;

  // ——— Estado del formulario ———
  readonly flowSel = signal<FlowLevel | null>(null);
  readonly painSel = signal<Intensity | null>(null);
  readonly symptomsSel = signal<string[]>([]);
  /** Escala de ánimo 0–10 (0 bajo · 10 excelente; por defecto 5). */
  readonly moodScale = signal(5);
  readonly moodSel = signal<string | null>(null);
  readonly libido = signal(5);
  readonly sleep = signal(5);
  readonly stressSel = signal<StressLevel | null>(null);
  readonly bbtText = signal('');
  readonly mucusSel = signal<CervicalMucus | null>(null);
  readonly cervixHSel = signal<CervixHeight | null>(null);
  readonly cervixOSel = signal<CervixOpening | null>(null);
  readonly cervixFSel = signal<CervixFirmness | null>(null);
  readonly breastSel = signal<Intensity | null>(null);
  readonly digestionSel = signal<DigestionState | null>(null);
  /** Texto libre de la opción "Otros" en digestión. */
  readonly digestionOther = signal('');
  /** Texto libre de la opción "Otros" en síntomas. */
  readonly symptomsOther = signal('');
  readonly skinSel = signal<SkinState | null>(null);
  readonly alcoholSel = signal<AlcoholLevel | null>(null);
  readonly meds = signal('');
  readonly note = signal('');
  readonly exists = signal(false);
  readonly bbtError = signal('');

  /**
   * Relleno del track (variable CSS --pct). Una única barra: el track nativo
   * pinta la parte recorrida y el thumb queda centrado sobre ella.
   */
  readonly moodPct = computed(() => `${this.moodScale() * 10}%`);
  readonly libidoPct = computed(() => `${this.libido() * 10}%`);
  readonly sleepPct = computed(() => `${this.sleep() * 10}%`);

  constructor() {
    // Al cambiar el día, hidrata el formulario con el registro existente.
    effect(() => {
      const log = this.cycle.logFor(this.date());
      this.flowSel.set(log?.flow ?? null);
      this.painSel.set(log?.pain ?? null);
      this.symptomsSel.set(log?.symptoms ?? []);
      this.moodScale.set(log?.moodScale ?? 5);
      this.moodSel.set(log?.mood ?? null);
      this.libido.set(log?.libido ?? 5);
      this.sleep.set(log?.sleep ?? 5);
      this.stressSel.set(log?.stress ?? null);
      this.bbtText.set(log?.bbt != null ? String(log.bbt).replace('.', ',') : '');
      this.bbtError.set('');
      this.mucusSel.set(log?.mucus ?? null);
      this.cervixHSel.set(log?.cervixHeight ?? null);
      this.cervixOSel.set(log?.cervixOpening ?? null);
      this.cervixFSel.set(log?.cervixFirmness ?? null);
      this.breastSel.set(log?.breast ?? null);
      this.digestionSel.set(log?.digestion ?? null);
      this.digestionOther.set(log?.digestionOther ?? '');
      this.symptomsOther.set(log?.symptomsOther ?? '');
      this.skinSel.set(log?.skin ?? null);
      this.alcoholSel.set(log?.alcohol ?? null);
      this.meds.set(log?.meds ?? '');
      this.note.set(log?.note ?? '');
      this.exists.set(!!log);
    });
  }

  // ——— Acciones ———

  toggleFlow(id: FlowLevel): void {
    this.flowSel.update((f) => (f === id ? null : id));
  }

  toggleSymptom(id: string): void {
    this.symptomsSel.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }

  /** Selecciona/deselecciona una opción segmentada (toggle: volver a pulsar limpia). */
  pick<T>(sel: WritableSignal<T | null>, id: T): void {
    sel.set(sel() === id ? null : id);
  }

  onDigestionOther(e: Event): void {
    this.digestionOther.set((e.target as HTMLInputElement).value.slice(0, 80));
  }

  onSymptomsOther(e: Event): void {
    this.symptomsOther.set((e.target as HTMLInputElement).value.slice(0, 80));
  }

  onMood(e: Event): void {
    this.moodScale.set(Number((e.target as HTMLInputElement).value));
  }

  /** Al elegir un estado cualitativo, la escala salta a su puntuación. */
  toggleMood(id: string): void {
    this.moodSel.update((m) => (m === id ? null : id));
    if (this.moodSel()) this.moodScale.set(MOOD_SCORES[id] ?? 5);
  }

  onBbt(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.bbtText.set(v);
    if (!v.trim()) {
      this.bbtError.set('');
      return;
    }
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n < this.bbtMin || n > this.bbtMax) {
      this.bbtError.set(`Introduce una temperatura entre ${this.bbtMin} y ${this.bbtMax} °C`);
    } else {
      this.bbtError.set('');
    }
    // Con validación en vivo, inhabilita caracteres no numéricos (salvo coma/punto).
    const cleaned = v.replace(/[^0-9.,]/g, '');
    if (cleaned !== v) this.bbtText.set(cleaned);
  }

  onMeds(e: Event): void {
    this.meds.set((e.target as HTMLTextAreaElement).value.slice(0, 200));
  }

  onNote(e: Event): void {
    this.note.set((e.target as HTMLTextAreaElement).value.slice(0, 500));
  }

  save(): void {
    if (this.bbtError()) return;
    const bbt = this.bbtText().trim() ? Number(this.bbtText().replace(',', '.')) : null;
    this.cycle.saveLog(this.date(), {
      flow: this.flowSel(),
      pain: this.painSel(),
      symptoms: this.symptomsSel(),
      mood: this.moodSel(),
      moodScale: this.moodScale(),
      libido: this.libido(),
      sleep: this.sleep(),
      stress: this.stressSel(),
      bbt,
      mucus: this.mucusSel(),
      cervixHeight: this.cervixHSel(),
      cervixOpening: this.cervixOSel(),
      cervixFirmness: this.cervixFSel(),
      breast: this.breastSel(),
      digestion: this.digestionSel(),
      digestionOther: this.digestionSel() === 'other' ? this.digestionOther().trim() : '',
      symptomsOther: this.symptomsSel().includes('other') ? this.symptomsOther().trim() : '',
      skin: this.skinSel(),
      alcohol: this.alcoholSel(),
      meds: this.meds(),
      note: this.note(),
    });
    this.toast.success('Día guardado 🌙');
    this.saved.emit();
  }

  remove(): void {
    this.cycle.deleteLog(this.date());
    this.toast.info('Registro eliminado');
    this.saved.emit();
  }

  // ——— Clases para la plantilla ———

  flowClass(id: FlowLevel): string {
    return this.flowSel() === id
      ? 'bg-linear-to-br from-blush-300 to-lilac-400 text-white shadow-glow ring-0'
      : 'bg-white text-plum-600 ring-plum-900/10 hover:bg-blush-50';
  }

  segClass<T>(sel: T | null, id: T): string {
    return sel === id ? 'seg seg-on' : 'seg';
  }

  symptomClass(id: string): string {
    return this.symptomsSel().includes(id) ? 'chip-on' : 'chip';
  }

  moodClass(id: string): string {
    return this.moodSel() === id
      ? 'scale-105 bg-blush-100 ring-2 ring-blush-400'
      : 'bg-white ring-1 ring-plum-900/10 hover:bg-blush-50';
  }
}
