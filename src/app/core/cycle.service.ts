import { ChangeDetectionStrategy, Injectable, computed, inject, signal } from '@angular/core';
import { CryptoService } from './crypto.service';
import { CycleSettings, DailyLog, VaultData, emptyVault, hasAnyLogData } from './models';
import { diffDays, toISO, todayISO } from './date';
import { DayCell, Insights, computeInsights, mergeVaults, moodScaleFromLog } from './insights';
import { StorageService } from './storage.service';
import { SyncService } from './sync.service';
import { VaultPayload } from './api.service';

/**
 * Fuente de verdad del ciclo: una bóveda (ajustes + registros diarios)
 * mantenida en memoria como signal, cifrada al persistir y sincronizada.
 */
@Injectable({ providedIn: 'root' })
export class CycleService {
  private readonly crypto = inject(CryptoService);
  private readonly storage = inject(StorageService);
  private readonly sync = inject(SyncService);

  private key: CryptoKey | null = null;
  private userId: string | null = null;

  readonly vault = signal<VaultData | null>(null);
  readonly settings = computed(() => this.vault()?.settings ?? null);
  readonly logs = computed(() => this.vault()?.logs ?? {});
  readonly insights = computed<Insights>(() => computeInsights(this.vault()));

  attach(userId: string, key: CryptoKey): void {
    this.userId = userId;
    this.key = key;
    this.sync.conflictHandler = (remote) => this.onRemoteConflict(remote);
  }

  detach(): void {
    this.userId = null;
    this.key = null;
    this.vault.set(null);
    this.sync.conflictHandler = null;
  }

  /** ¿Existe ya una copia cifrada en este dispositivo para el usuario actual? */
  hasLocalCopy(): boolean {
    return !!this.userId && this.storage.vaultLoad(this.userId) !== null;
  }

  /**
   * Crea una bóveda vacía **solo si no hay ninguna copia local**. Sin esta
   * guarda, un PIN equivocado podía sobrescribir la bóveda existente con una
   * vacía cifrada con la clave incorrecta.
   */
  async initVault(): Promise<void> {
    if (this.hasLocalCopy()) return;
    const v = emptyVault();
    v.updatedAt = Date.now();
    this.vault.set(v);
    await this.persist();
  }

  /** Descifra y carga la bóveda local. Devuelve false si no existe o la clave no coincide. */
  async loadLocal(): Promise<boolean> {
    if (!this.userId || !this.key) return false;
    const enc = this.storage.vaultLoad(this.userId);
    if (!enc) return false;
    try {
      const v = await this.crypto.decryptJson<VaultData>(this.key, enc);
      this.normalize(v);
      this.vault.set(v);
      return true;
    } catch {
      return false;
    }
  }

  /** Concilia con el servidor: adopta remota si es más nueva, si no sube la local. */
  async reconcileWithServer(): Promise<void> {
    if (!this.key || !this.userId) return;
    const remote = await this.sync.pull();
    if (!remote) {
      await this.persist();
      return;
    }
    try {
      const rv = await this.crypto.decryptJson<VaultData>(this.key, remote.data_enc);
      this.normalize(rv);
      const lv = this.vault();
      if (!lv || rv.updatedAt > lv.updatedAt) {
        this.vault.set(rv);
        await this.persist();
      }
    } catch {
      await this.persist(); // remota ilegible con esta clave: manda la local
    }
  }

  updateSettings(patch: Partial<CycleSettings>): void {
    const v = this.vault();
    if (!v) return;
    this.vault.set({ ...v, settings: { ...v.settings, ...patch } });
    void this.persist();
  }

  logFor(date: string): DailyLog | undefined {
    return this.vault()?.logs[date];
  }

  saveLog(date: string, patch: Partial<Omit<DailyLog, 'date' | 'updatedAt'>>): void {
    const v = this.vault();
    if (!v) return;
    const prev = v.logs[date];
    const next: DailyLog = {
      date,
      flow: patch.flow !== undefined ? patch.flow : (prev?.flow ?? null),
      symptoms: patch.symptoms ?? prev?.symptoms ?? [],
      mood: patch.mood !== undefined ? patch.mood : (prev?.mood ?? null),
      note: patch.note ?? prev?.note ?? '',
      pain: patch.pain !== undefined ? patch.pain : (prev?.pain ?? null),
      libido: patch.libido !== undefined ? patch.libido : (prev?.libido ?? null),
      sleep: patch.sleep !== undefined ? patch.sleep : (prev?.sleep ?? null),
      stress: patch.stress !== undefined ? patch.stress : (prev?.stress ?? null),
      moodScale: patch.moodScale !== undefined ? patch.moodScale : (prev?.moodScale ?? null),
      bbt: patch.bbt !== undefined ? patch.bbt : (prev?.bbt ?? null),
      mucus: patch.mucus !== undefined ? patch.mucus : (prev?.mucus ?? null),
      cervixHeight:
        patch.cervixHeight !== undefined ? patch.cervixHeight : (prev?.cervixHeight ?? null),
      cervixOpening:
        patch.cervixOpening !== undefined ? patch.cervixOpening : (prev?.cervixOpening ?? null),
      cervixFirmness:
        patch.cervixFirmness !== undefined ? patch.cervixFirmness : (prev?.cervixFirmness ?? null),
      breast: patch.breast !== undefined ? patch.breast : (prev?.breast ?? null),
      digestion: patch.digestion !== undefined ? patch.digestion : (prev?.digestion ?? null),
      digestionOther: patch.digestionOther ?? prev?.digestionOther ?? '',
      symptomsOther: patch.symptomsOther ?? prev?.symptomsOther ?? '',
      skin: patch.skin !== undefined ? patch.skin : (prev?.skin ?? null),
      alcohol: patch.alcohol !== undefined ? patch.alcohol : (prev?.alcohol ?? null),
      meds: patch.meds ?? prev?.meds ?? '',
      updatedAt: Date.now(),
    };
    const logs = { ...v.logs, [date]: next };
    this.commit({ ...v, logs });
  }

  deleteLog(date: string): void {
    const v = this.vault();
    if (!v || !v.logs[date]) return;
    const logs = { ...v.logs };
    delete logs[date];
    this.commit({ ...v, logs });
  }

  buildMonth(year: number, month: number): DayCell[] {
    const v = this.vault();
    const ins = this.insights();
    const today = todayISO();

    const blank = (): DayCell => ({
      date: '',
      day: 0,
      inMonth: false,
      isToday: false,
      flow: null,
      logged: false,
      hasNote: false,
      moodScale: null,
      state: null,
    });

    const cells: DayCell[] = [];
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7; // lunes primero
    for (let i = 0; i < startOffset; i++) cells.push(blank());

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toISO(new Date(year, month, d));
      const log = v?.logs[iso];
      let state: DayCell['state'] = null;
      if (log?.flow) {
        state = 'period';
      } else if (
        ins.nextStart &&
        iso >= today &&
        diffDays(ins.nextStart, iso) >= 0 &&
        diffDays(ins.nextStart, iso) < (ins.avgPeriod ?? 5)
      ) {
        state = 'predicted';
      } else if (
        ins.lastStart &&
        ins.fertileStart &&
        ins.fertileEnd &&
        iso >= ins.lastStart &&
        iso >= ins.fertileStart &&
        iso <= ins.fertileEnd
      ) {
        state = iso === ins.ovulationDate ? 'ovulation' : 'fertile';
      }
      cells.push({
        date: iso,
        day: d,
        inMonth: true,
        isToday: iso === today,
        flow: log?.flow ?? null,
        logged: hasAnyLogData(log),
        hasNote: !!log?.note,
        moodScale: moodScaleFromLog(log),
        state,
      });
    }
    while (cells.length % 7 !== 0) cells.push(blank());
    return cells;
  }

  exportJson(): string {
    return JSON.stringify(this.vault(), null, 2);
  }

  private commit(v: VaultData): void {
    const flowDates = Object.values(v.logs)
      .filter((l) => l.flow)
      .map((l) => l.date)
      .sort();
    const settings: CycleSettings = {
      ...v.settings,
      lastPeriodStart: flowDates[0] ?? v.settings.lastPeriodStart,
    };
    this.vault.set({ ...v, settings, updatedAt: Date.now() });
    void this.persist();
  }

  /** Cifra la bóveda, la guarda localmente y la encola para sincronizar. */
  async persist(): Promise<void> {
    const v = this.vault();
    if (!v || !this.key || !this.userId) return;
    v.updatedAt = Date.now();
    const enc = await this.crypto.encryptJson(this.key, v);
    this.storage.vaultSave(this.userId, enc, v.updatedAt);
    this.sync.push(enc, v.updatedAt);
  }

  private async onRemoteConflict(remote: VaultPayload): Promise<void> {
    if (!this.key) return;
    try {
      const rv = await this.crypto.decryptJson<VaultData>(this.key, remote.data_enc);
      this.normalize(rv);
      const lv = this.vault();
      const merged = lv ? mergeVaults(lv, rv) : rv;
      this.vault.set(merged);
      await this.persist();
    } catch {
      /* remota ilegible: se mantiene la local */
    }
  }

  private normalize(v: VaultData): void {
    const base = emptyVault();
    v.version ??= 1;
    v.settings ??= base.settings;
    v.logs ??= {};
  }
}
