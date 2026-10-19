import { Injectable } from '@angular/core';

/**
 * Criptografía del cliente basada en WebCrypto:
 * - Códigos de referencia aleatorios (CSPRNG).
 * - SHA-256 para identificadores/verificadores.
 * - PBKDF2-SHA256 (210 000 iteraciones) para derivar la clave de la bóveda.
 * - AES-256-GCM para cifrar toda la bóveda de datos.
 */
@Injectable({ providedIn: 'root' })
export class CryptoService {
  private readonly te = new TextEncoder();

  async sha256Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', this.te.encode(input));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Código tipo LUNA-XXXX-XXXX sin caracteres ambiguos. */
  randomRefCode(): string {
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
    return `LUNA-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
  }

  randomSalt(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Deriva la clave de la bóveda desde el secreto (PIN/contraseña) con PBKDF2.
   *
   * `extractable: false` es deliberado: la clave **no puede exportarse** ni
   * serializarse, así que nunca puede acabar en localStorage/sessionStorage.
   * Vive solo en memoria mientras la sesión está desbloqueada; al recargar la
   * app se vuelve a derivar pidiendo el PIN.
   */
  async deriveKey(secret: string, salt: string): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey('raw', this.te.encode(secret), 'PBKDF2', false, [
      'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: this.te.encode(salt), iterations: 210_000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false, // no extraíble: la clave jamás sale de memoria
      ['encrypt', 'decrypt'],
    );
  }

  /** Devuelve "ivBase64.cipherBase64". */
  async encryptJson(key: CryptoKey, value: unknown): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      this.te.encode(JSON.stringify(value)),
    );
    return `${bufToB64(iv)}.${bufToB64(data)}`;
  }

  async decryptJson<T>(key: CryptoKey, payload: string): Promise<T> {
    const [ivB64, dataB64] = payload.split('.');
    if (!ivB64 || !dataB64) throw new Error('Payload corrupto');
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
      key,
      b64ToBytes(dataB64),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  }
}

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
