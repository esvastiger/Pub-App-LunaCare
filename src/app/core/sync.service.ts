import { Injectable, inject, signal } from '@angular/core';
import { ApiService, VaultPayload } from './api.service';
import { StorageService, SyncAuth } from './storage.service';

export type SyncStatus = 'disabled' | 'offline' | 'syncing' | 'synced' | 'error';

/**
 * Sincronización opportunista de la bóveda cifrada:
 * push con debounce tras cada guardado y pull al iniciar sesión.
 * El servidor solo ve texto cifrado (AES-GCM) — nunca datos en claro.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);

  readonly status = signal<SyncStatus>('offline');
  readonly lastSyncAt = signal<number | null>(null);

  /** Lo registra CycleService para resolver conflictos (mezcla por updatedAt). */
  conflictHandler: ((remote: VaultPayload) => Promise<void>) | null = null;

  private creds: SyncAuth | null = null;
  private pending: VaultPayload | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private serverUpdatedAt = 0;

  setCredentials(c: SyncAuth | null): void {
    this.creds = c;
    this.serverUpdatedAt = 0;
  }

  async ping(): Promise<void> {
    const ok = await this.api.ping();
    if (!ok || !this.storage.prefs().syncEnabled) {
      this.status.set(!this.storage.prefs().syncEnabled ? 'disabled' : 'offline');
      return;
    }
    this.status.set(this.creds ? 'synced' : 'offline');
  }

  push(enc: string, updatedAt: number): void {
    if (!this.storage.prefs().syncEnabled) {
      this.status.set('disabled');
      return;
    }
    if (!this.creds) return;
    this.pending = { data_enc: enc, updatedAt };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 1500);
  }

  /**
   * Descarga la bóveda remota (null si no hay o si está offline).
   *
   * `force` permite leerla aunque la sincronización esté desactivada: lo usa el
   * desbloqueo de cuentas de Google, donde la copia remota es la única prueba
   * criptográfica de que el PIN es correcto.
   */
  async pull(force = false): Promise<VaultPayload | null> {
    if (!this.creds) return null;
    if (!force && !this.storage.prefs().syncEnabled) return null;
    const res = await this.api.getVault(this.creds.token ?? '');
    if (res.kind !== 'ok') return null;
    this.serverUpdatedAt = res.data.updatedAt ?? 0;
    return res.data.data_enc
      ? { data_enc: res.data.data_enc, updatedAt: res.data.updatedAt ?? 0 }
      : null;
  }

  private async flush(): Promise<void> {
    if (!this.creds || !this.pending) return;
    const payload = this.pending;
    this.pending = null;
    this.status.set('syncing');

    let res = await this.api.putVault(this.creds.token ?? '', {
      ...payload,
      baseUpdatedAt: this.serverUpdatedAt,
    });

    // Token caducado → re-login silencioso y un reintento.
    if (res.kind === 'server-error' && /token|unauthorized|autoriz/i.test(res.error)) {
      if (await this.relogin()) {
        res = await this.api.putVault(this.creds.token ?? '', {
          ...payload,
          baseUpdatedAt: this.serverUpdatedAt,
        });
      }
    }

    if (res.kind === 'offline') {
      this.pending = payload; // reintento en el próximo guardado
      this.status.set('offline');
      return;
    }
    if (res.kind === 'server-error') {
      this.status.set('error');
      return;
    }

    if (res.data.conflict && res.data.data_enc) {
      // El servidor tiene una versión más nueva: mezclar (el handler actualiza y vuelve a subir).
      const remote: VaultPayload = {
        data_enc: res.data.data_enc,
        updatedAt: res.data.updatedAt ?? Date.now(),
      };
      this.serverUpdatedAt = remote.updatedAt;
      await this.conflictHandler?.(remote);
    } else {
      this.serverUpdatedAt = payload.updatedAt;
    }

    this.lastSyncAt.set(Date.now());
    this.status.set('synced');
  }

  private async relogin(): Promise<boolean> {
    if (!this.creds) return false;
    // Con Google no hay secreto guardado que reenviar: el token caducado exige
    // que la usuaria vuelva a entrar con Google (y su PIN).
    if (this.creds.kind === 'google') {
      this.status.set('error');
      return false;
    }
    const r =
      this.creds.kind === 'anon'
        ? await this.api.loginAnon(this.creds.identifier, this.creds.verifier)
        : await this.api.loginEmail(this.creds.identifier, this.creds.verifier);
    if (r.kind !== 'ok') {
      this.status.set('error');
      return false;
    }
    this.creds = { ...this.creds, token: r.data.token };
    this.serverUpdatedAt = 0;
    // Refrescar el token también en el almacenamiento de sesión.
    const stored = this.storage.creds();
    if (stored) {
      this.storage.saveCreds({ ...stored, syncAuth: this.creds }, this.storage.prefs().remember);
    }
    return true;
  }
}
