import { signal } from '@angular/core';

const LOCK_PREFIX = 'lunacare.lock.';
/** Intentos "gratis" antes de empezar a bloquear. */
const FREE_ATTEMPTS = 5;
/** Segundos de espera progresivos (se duplican) a partir del fallo nº FREE_ATTEMPTS. */
const BACKOFF_SECONDS = [15, 30, 60, 120, 300, 900];

interface GateSnapshot {
  failures: number;
  /** Timestamp (ms) en el que expira el bloqueo; 0 = sin bloqueo. */
  unlockAt: number;
}

/**
 * Portero anti fuerza-bruta con temporizador progresivo:
 * - 5 fallos → 15 s; siguiente → 30 s; 1 min; 2 min; 5 min; 15 min (tope).
 * - El estado vive en localStorage (clave por acción): recargar la página
 *   NO reinicia el castigo.
 * - Compatible con el rate limiting del servidor: `penalize(seconds)` obedece
 *   al `retryAfter` del 429 aunque el contador local no haya llegado al límite.
 *
 * `secondsLeft()` es una signal reactiva para pintar la cuenta atrás.
 */
export class LoginGate {
  readonly secondsLeft = signal(0);

  private readonly key: string;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(action: string) {
    this.key = LOCK_PREFIX + action;
    this.startTicking();
  }

  /** true = hay bloqueo activo ahora mismo. */
  get locked(): boolean {
    return this.secondsLeft() > 0;
  }

  /** Debe llamarse ANTES de intentar la acción. true = puede intentarlo. */
  check(): boolean {
    return !this.locked;
  }

  /** Registra un fallo y aplica el bloqueo progresivo que toque. */
  fail(): void {
    const s = this.read();
    s.failures += 1;
    if (s.failures >= FREE_ATTEMPTS) {
      const i = Math.min(s.failures - FREE_ATTEMPTS, BACKOFF_SECONDS.length - 1);
      s.unlockAt = Date.now() + BACKOFF_SECONDS[i] * 1000;
    }
    this.write(s);
    this.startTicking();
  }

  /** Bloqueo impuesto por el servidor (HTTP 429 + retryAfter en segundos). */
  penalize(seconds: number): void {
    const s = this.read();
    s.failures = Math.max(s.failures, FREE_ATTEMPTS);
    s.unlockAt = Math.max(s.unlockAt, Date.now() + seconds * 1000);
    this.write(s);
    this.startTicking();
  }

  /** Éxito: se limpia todo el historial. */
  success(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* almacenamiento no disponible */
    }
    this.secondsLeft.set(0);
  }

  /** Etiqueta "mm:ss" para la UI. */
  static fmt(total: number): string {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------------ internals

  private read(): GateSnapshot {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const p = JSON.parse(raw) as Partial<GateSnapshot>;
        if (typeof p.failures === 'number' && typeof p.unlockAt === 'number') {
          // Si el bloqueo ya expiró, normalizamos unlockAt a 0.
          return { failures: p.failures, unlockAt: Math.max(p.unlockAt, 0) };
        }
      }
    } catch {
      /* corrupto → reset */
    }
    return { failures: 0, unlockAt: 0 };
  }

  private write(s: GateSnapshot): void {
    try {
      if (s.failures <= 0) {
        localStorage.removeItem(this.key);
      } else {
        localStorage.setItem(this.key, JSON.stringify(s));
      }
    } catch {
      /* almacenamiento no disponible */
    }
  }

  private startTicking(): void {
    const refresh = () => {
      const { unlockAt } = this.read();
      const left = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      this.secondsLeft.set(left);
      if (left === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
    refresh();
    if (this.secondsLeft() > 0 && !this.timer) {
      this.timer = setInterval(refresh, 1000);
    }
  }
}
