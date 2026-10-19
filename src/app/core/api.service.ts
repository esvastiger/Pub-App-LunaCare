import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { StorageService } from './storage.service';

export interface RegisterResponse {
  userId: string;
  token: string;
  salt?: string;
}

export interface LoginResponse extends RegisterResponse {
  data_enc?: string | null;
  updatedAt?: number | null;
  /** El correo está vinculado a Google y puede entrar también con él. */
  googleLinked?: boolean;
}

export interface GoogleAuthResponse {
  userId: string;
  token: string;
  email: string;
  /** 'google' = cuenta creada con Google · 'email' = cuenta de correo vinculada. */
  mode: 'google' | 'email';
  salt: string;
  /** true = primera vez: el cliente debe pedir un PIN y crear la bóveda. */
  newAccount: boolean;
  hasVault: boolean;
}

export interface VaultPayload {
  data_enc: string;
  updatedAt: number;
}

export interface PutVaultResponse {
  conflict: boolean;
  data_enc?: string;
  updatedAt?: number;
}

export type CallResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'server-error'; error: string; retryAfter?: number }
  | { kind: 'offline' };

type ServerEnvelope = Record<string, unknown> & { ok?: boolean; error?: string };

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);

  /** null = aún sin comprobar. */
  readonly reachable = signal<boolean | null>(null);

  async ping(): Promise<boolean> {
    const r = await this.call<{ time: number }>('ping', {}, undefined, 2500);
    return r.kind === 'ok';
  }

  registerAnon(refCodeHash: string, pinVerifier: string): Promise<CallResult<RegisterResponse>> {
    return this.call('register.anon', { refCodeHash, pinVerifier });
  }

  loginAnon(refCodeHash: string, pinVerifier: string): Promise<CallResult<LoginResponse>> {
    return this.call('login.anon', { refCodeHash, pinVerifier });
  }

  registerEmail(
    email: string,
    passwordVerifier: string,
    salt: string,
  ): Promise<CallResult<RegisterResponse>> {
    return this.call('register.email', { email, passwordVerifier, salt });
  }

  loginEmail(email: string, passwordVerifier: string): Promise<CallResult<LoginResponse>> {
    return this.call('login.email', { email, passwordVerifier });
  }

  linkEmail(
    token: string,
    email: string,
    passwordVerifier: string,
    salt: string,
  ): Promise<CallResult<{ linked: boolean }>> {
    return this.call('link.email', { email, passwordVerifier, salt }, token);
  }

  /**
   * Canjea un ID token de Google (firmado por Google) por una sesión.
   * El servidor valida la firma: aquí no viaja ningún secreto de la bóveda.
   */
  authGoogle(credential: string): Promise<CallResult<GoogleAuthResponse>> {
    return this.call('auth.google', { credential });
  }

  /** Vincula la identidad de Google a la cuenta con correo ya autenticada. */
  linkGoogle(token: string, credential: string): Promise<CallResult<{ linked: boolean }>> {
    return this.call('link.google', { credential }, token);
  }

  getVault(
    token: string,
  ): Promise<CallResult<{ data_enc: string | null; updatedAt: number | null }>> {
    return this.call('vault.get', {}, token);
  }

  putVault(
    token: string,
    payload: VaultPayload & { baseUpdatedAt: number },
  ): Promise<CallResult<PutVaultResponse>> {
    return this.call('vault.put', payload, token);
  }

  private async call<T>(
    action: string,
    body?: object,
    token?: string,
    timeoutMs = 6000,
  ): Promise<CallResult<T>> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const payload: Record<string, unknown> = { ...(body ?? {}) };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        payload['token'] = token; // respaldo para Apache que descarta Authorization
      }
      const res = await firstValueFrom(
        this.http
          .post<ServerEnvelope>(`${this.storage.apiBase()}/index.php?action=${action}`, payload, {
            headers,
          })
          .pipe(
            timeout(timeoutMs),
            catchError((err: unknown) => {
              // Distinguir fallo de red (offline) de errores del servidor (4xx/5xx).
              if (err instanceof HttpErrorResponse && err.status >= 400) {
                const body = err.error as ServerEnvelope | null;
                if (body && body.ok === false) return of(body);
                return of({
                  ok: false,
                  error: err.status === 401 ? 'UNAUTHORIZED' : `HTTP_${err.status}`,
                } as ServerEnvelope);
              }
              return of(null);
            }),
          ),
      );
      if (!res) {
        this.reachable.set(false);
        return { kind: 'offline' };
      }
      if (res.ok === false) {
        return {
          kind: 'server-error',
          error: String(res.error ?? 'ERROR'),
          retryAfter: typeof res['retryAfter'] === 'number' ? res['retryAfter'] : undefined,
        };
      }
      this.reachable.set(true);
      return { kind: 'ok', data: res as unknown as T };
    } catch {
      this.reachable.set(false);
      return { kind: 'offline' };
    }
  }
}
