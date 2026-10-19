import { Injectable, NgZone, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { ToastService } from '../shared/ui';

/**
 * Capa PWA:
 * - Detecta nuevas versiones precacheadas por el service worker y ofrece
 *   recargar con un toast persistente (nunca actualiza sin permiso).
 * - Expone el estado de conectividad para el banner del shell.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly zone = inject(NgZone);
  private readonly updates = inject(SwUpdate);
  private readonly toast = inject(ToastService);

  /** null = aún sin comprobar. */
  readonly online = signal<boolean | null>(
    typeof navigator !== 'undefined' ? navigator.onLine : null,
  );

  constructor() {
    this.zone.runOutsideAngular(() => {
      window.addEventListener('online', () => this.zone.run(() => this.online.set(true)));
      window.addEventListener('offline', () => this.zone.run(() => this.online.set(false)));
    });

    if (this.updates.isEnabled) {
      this.updates.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this.zone.run(() => this.offerReload()));
    }
  }

  private offerReload(): void {
    const id = this.toast.show('Nueva versión de LunaCare disponible', 'info', 600000);
    this.toast.addActions(id, [
      {
        label: 'Recargar',
        run: () => {
          // Aplica la versión precacheada y recarga la app entera.
          this.updates.activateUpdate().finally(() => document.location.reload());
        },
      },
    ]);
  }
}
