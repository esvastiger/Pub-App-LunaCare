import { Injectable } from '@angular/core';
import { Session } from './models';

export interface SyncAuth {
  kind: 'anon' | 'email' | 'google';
  /** anon → sha256 del código normalizado · email/google → correo (identificador público). */
  identifier: string;
  /**
   * sha256("lunacare:pin|pwd:<secreto>") — el secreto nunca viaja en claro.
   * Vacío en cuentas de Google: no hay verificador que enviar (el PIN solo
   * sirve para derivar la clave de la bóveda).
   */
  verifier: string;
  token: string | null;
}

export interface StoredCreds {
  session: Session;
  syncAuth: SyncAuth | null;
  /**
   * Formato persistido. 2 = sin clave AES (la clave nunca se guarda).
   * Un valor ausente o 1 corresponde a versiones antiguas que sí guardaban
   * `keyB64`; se purga al arrancar.
   */
  v?: 2;
  /** @deprecated Solo aparece en datos heredados; se elimina en el arranque. */
  keyB64?: string;
}

export interface AccountIndexEntry {
  /** Hash de búsqueda (nunca datos en claro). */
  lookup: string;
  userId: string;
  mode: 'anonymous' | 'email' | 'google';
  /**
   * Salt PBKDF2. Las cuentas con correo y con Google lo reciben del servidor;
   * el modo anónimo usa el propio código de referencia como salt.
   */
  salt: string;
}

export interface Prefs {
  remember: boolean;
  syncEnabled: boolean;
}

const CREDS_KEY = 'lunacare.creds';
const INDEX_KEY = 'lunacare.index';
const PREFS_KEY = 'lunacare.prefs';
const API_BASE_KEY = 'lunacare.apiBase';

@Injectable({ providedIn: 'root' })
export class StorageService {
  creds(): StoredCreds | null {
    return this.readLocal<StoredCreds>(CREDS_KEY) ?? this.readSession<StoredCreds>(CREDS_KEY);
  }

  /**
   * Guarda solo la identidad de la sesión (usuario + token de sincronización).
   * La clave de la bóveda no se persiste nunca: se re-deriva con el PIN.
   */
  saveCreds(c: StoredCreds, remember: boolean): void {
    this.clearCreds();
    const safe: StoredCreds = { session: c.session, syncAuth: c.syncAuth, v: 2 };
    (remember ? localStorage : sessionStorage).setItem(CREDS_KEY, JSON.stringify(safe));
  }

  clearCreds(): void {
    localStorage.removeItem(CREDS_KEY);
    sessionStorage.removeItem(CREDS_KEY);
  }

  index(): AccountIndexEntry[] {
    return this.readLocal<AccountIndexEntry[]>(INDEX_KEY) ?? [];
  }

  saveIndexEntry(e: AccountIndexEntry): void {
    const list = this.index().filter((x) => x.lookup !== e.lookup);
    list.push(e);
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  }

  prefs(): Prefs {
    return { remember: false, syncEnabled: true, ...this.readLocal<Prefs>(PREFS_KEY) };
  }

  savePrefs(p: Prefs): void {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  }

  apiBase(): string {
    return localStorage.getItem(API_BASE_KEY) ?? 'http://localhost/lunacare-api';
  }

  setApiBase(v: string): void {
    localStorage.setItem(API_BASE_KEY, v.trim().replace(/\/+$/, ''));
  }

  vaultLoad(userId: string): string | null {
    return localStorage.getItem(`lunacare.vault.${userId}`);
  }

  vaultSave(userId: string, enc: string, updatedAt: number): void {
    localStorage.setItem(`lunacare.vault.${userId}`, enc);
    localStorage.setItem(`lunacare.vault.${userId}.ts`, String(updatedAt));
  }

  vaultUpdatedAt(userId: string): number {
    return Number(localStorage.getItem(`lunacare.vault.${userId}.ts`) ?? 0);
  }

  vaultClear(userId: string): void {
    localStorage.removeItem(`lunacare.vault.${userId}`);
    localStorage.removeItem(`lunacare.vault.${userId}.ts`);
  }

  wipeAll(): void {
    const wipe = (store: Storage) => {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith('lunacare.')) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    };
    wipe(localStorage);
    wipe(sessionStorage);
  }

  private readLocal<T>(k: string): T | null {
    return this.read<T>(localStorage, k);
  }

  private readSession<T>(k: string): T | null {
    return this.read<T>(sessionStorage, k);
  }

  private read<T>(store: Storage, k: string): T | null {
    try {
      const raw = store.getItem(k);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}
