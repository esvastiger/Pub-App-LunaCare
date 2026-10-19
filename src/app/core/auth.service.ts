import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { CryptoService } from './crypto.service';
import { CycleService } from './cycle.service';
import { AuthMode, Session } from './models';
import { StorageService, SyncAuth, Prefs } from './storage.service';
import { SyncService } from './sync.service';

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** Segundos que el servidor manda esperar (HTTP 429 anti fuerza-bruta). */
  retryAfter?: number;
}

export interface GoogleStartResult extends AuthResult {
  /**
   * Siguiente paso tras validar la identidad con Google:
   * - `setPin`: cuenta nueva, hay que elegir el PIN que cifrará la bóveda.
   * - `unlock`: cuenta existente, hace falta el PIN (o la contraseña) para
   *   descifrar los datos que ya están en el servidor.
   */
  next?: 'setPin' | 'unlock';
}

/** Identidad de Google validada por el servidor, a la espera del secreto local. */
export interface GooglePending {
  email: string;
  /** 'google' → PIN · 'email' → contraseña (cuenta de correo vinculada a Google). */
  mode: Exclude<AuthMode, 'anonymous'>;
  newAccount: boolean;
}

/**
 * Autenticación dual:
 * - Anónima: código de referencia (LUNA-XXXX-XXXX) + PIN. La clave de la bóveda
 *   se deriva del PIN con PBKDF2 (salt = código). El servidor solo ve hashes.
 * - Correo/contraseña: igual, con salt aleatorio persistido en el servidor.
 * - Google: el servidor verifica el ID token firmado por Google y emite su
 *   propio token de sincronización. Google **no** sustituye al secreto de la
 *   bóveda: con una cuenta de Google se pide un PIN; en una cuenta de correo
 *   vinculada se pide su contraseña. La clave AES nunca sale del dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly crypto = inject(CryptoService);
  private readonly storage = inject(StorageService);
  private readonly api = inject(ApiService);
  private readonly sync = inject(SyncService);
  readonly cycle = inject(CycleService);

  readonly session = signal<Session | null>(null);
  readonly ready = signal(false);
  readonly remember = signal(false);
  /**
   * Hay una sesión recordada pero la bóveda está cerrada: falta el PIN.
   * La clave AES nunca se persiste, así que al recargar hay que re-derivarla.
   */
  readonly locked = signal(false);
  readonly isAnonymous = computed(() => this.session()?.mode === 'anonymous');
  /**
   * Identidad de Google ya validada por el servidor, pendiente del PIN o la
   * contraseña que deriva la clave. No se guarda nada en el dispositivo hasta
   * que la bóveda se descifra correctamente.
   */
  readonly googlePending = signal<GooglePending | null>(null);

  /** Preferencias locales (recordar sesión, sincronización). */
  prefs(): Prefs {
    return this.storage.prefs();
  }

  private vaultKey: CryptoKey | null = null;
  private syncAuth: SyncAuth | null = null;

  /**
   * Restaura la identidad de la sesión, **sin la clave**.
   *
   * La bóveda queda cerrada (`locked`) hasta que la usuaria introduce su PIN:
   * es la única forma de que un XSS no pueda descifrar el historial aunque
   * consiga leer el almacenamiento del navegador.
   */
  async init(): Promise<void> {
    const creds = this.storage.creds();
    if (creds) {
      this.session.set(creds.session);
      this.syncAuth = creds.syncAuth;
      this.remember.set(this.storage.prefs().remember);
      this.locked.set(true);
      // Migración: reescribe las credenciales sin `keyB64` para purgar claves
      // exportadas que versiones anteriores dejaban en el dispositivo.
      this.storage.saveCreds(
        { session: creds.session, syncAuth: creds.syncAuth },
        this.storage.prefs().remember,
      );
    }
    void this.sync.ping();
    this.ready.set(true);
  }

  /**
   * Abre la bóveda re-derivando la clave desde el secreto (PIN o contraseña).
   *
   * Verificación en cascada, siempre sin enviar el secreto al servidor:
   *  1. Descifrar la copia local → prueba criptográfica directa.
   *  2. Si no hay copia local (dispositivo nuevo), descifrar la remota.
   *  3. Si tampoco hay remota, validar el verificador contra el servidor.
   *  4. Sin servidor y sin datos: no hay nada que proteger, se acepta.
   */
  async unlock(secret: string): Promise<AuthResult> {
    const s = this.session();
    if (!s) return { ok: false, error: 'No hay ninguna sesión que desbloquear.' };
    if (!secret.trim()) return { ok: false, error: 'Introduce tu PIN o contraseña.' };

    const salt = await this.saltFor(s);
    if (!salt) {
      return {
        ok: false,
        error: 'No podemos recuperar esta cuenta en este dispositivo. Inicia sesión de nuevo.',
      };
    }

    const usesPin = s.mode === 'anonymous' || s.mode === 'google';
    const wrongSecret = usesPin
      ? 'PIN incorrecto. Inténtalo de nuevo.'
      : 'Contraseña incorrecta. Inténtalo de nuevo.';

    const key = await this.crypto.deriveKey(secret, salt);
    this.cycle.attach(s.userId, key);
    const hadLocalCopy = this.cycle.hasLocalCopy();

    if (await this.cycle.loadLocal()) {
      return this.completeUnlock(key);
    }

    // Había una copia local y no se pudo descifrar ⇒ el secreto es incorrecto.
    // Distinguirlo es crítico: sin esta rama, un PIN erróneo se trataría como
    // "dispositivo nuevo" y acabaría creando una bóveda vacía.
    if (hadLocalCopy) {
      this.cycle.detach();
      return { ok: false, error: wrongSecret };
    }

    // Sin copia local: comprobamos contra la remota (si existe). En Google se
    // fuerza la lectura: es la única forma de validar el PIN en otro dispositivo,
    // aunque la sincronización esté desactivada.
    this.sync.setCredentials(this.syncAuth);
    const remote = await this.sync.pull(s.mode === 'google');
    this.sync.setCredentials(null);

    if (remote) {
      try {
        await this.crypto.decryptJson(key, remote.data_enc);
        return this.completeUnlock(key);
      } catch {
        this.cycle.detach();
        return { ok: false, error: wrongSecret };
      }
    }

    // Ni local ni remota: si el servidor está disponible, valida el verificador.
    if (this.syncAuth && !(await this.verifySecretOnline(s.mode, secret))) {
      this.cycle.detach();
      return { ok: false, error: wrongSecret };
    }

    return this.completeUnlock(key);
  }

  private async completeUnlock(key: CryptoKey): Promise<AuthResult> {
    this.vaultKey = key;
    this.googlePending.set(null);
    this.locked.set(false);
    this.sync.setCredentials(this.syncAuth);
    await this.cycle.reconcileWithServer();
    if (!this.cycle.vault()) await this.cycle.initVault();
    return { ok: true };
  }

  /**
   * Salt PBKDF2 de la sesión: el propio código en modo anónimo o el del índice
   * local en cuentas de correo y de Google (el servidor lo entrega al entrar).
   */
  private async saltFor(s: Session): Promise<string | null> {
    if (s.mode === 'anonymous') return s.refCode ? normalizeRef(s.refCode) : null;
    const lookup = await this.crypto.sha256Hex(`lunacare:lookup:${s.email ?? ''}`);
    return this.storage.index().find((e) => e.lookup === lookup)?.salt ?? null;
  }

  /**
   * Última red de seguridad cuando no hay ninguna copia que descifrar: se
   * comprueba el verificador contra el servidor. Sin conexión se acepta,
   * porque no existen datos que proteger todavía.
   */
  private async verifySecretOnline(mode: Session['mode'], secret: string): Promise<boolean> {
    const auth = this.syncAuth;
    if (!auth) return true;
    // Cuentas de Google: no existe verificador en el servidor (el PIN solo
    // sirve para cifrar). Sin copia local ni remota no hay nada que proteger.
    if (!auth.verifier) return true;
    const verifier = await this.crypto.sha256Hex(
      `lunacare:${mode === 'anonymous' ? 'pin' : 'pwd'}:${secret}`,
    );
    const res =
      mode === 'anonymous'
        ? await this.api.loginAnon(auth.identifier, verifier)
        : await this.api.loginEmail(auth.identifier, verifier);
    if (res.kind === 'ok') {
      this.syncAuth = { ...auth, verifier, token: res.data.token };
      this.storage.saveCreds(
        { session: this.session()!, syncAuth: this.syncAuth },
        this.remember(),
      );
      return true;
    }
    return res.kind === 'offline';
  }

  /** Crea una cuenta anónima y devuelve la sesión con el código de referencia. */
  async createAnonymous(pin: string): Promise<Session> {
    const refCode = this.crypto.randomRefCode();
    const normalized = normalizeRef(refCode);
    const session: Session = {
      userId: crypto.randomUUID(),
      mode: 'anonymous',
      refCode,
      email: null,
      createdAt: Date.now(),
    };
    const identifier = await this.crypto.sha256Hex(`lunacare:ref:${normalized}`);
    const verifier = await this.crypto.sha256Hex(`lunacare:pin:${pin}`);
    await this.establishSession(session, pin, normalized, {
      kind: 'anon',
      identifier,
      verifier,
      token: null,
    });
    return session;
  }

  async registerEmail(email: string, password: string): Promise<AuthResult> {
    const salt = this.crypto.randomSalt();
    const session: Session = {
      userId: crypto.randomUUID(),
      mode: 'email',
      refCode: null,
      email: email.toLowerCase(),
      createdAt: Date.now(),
    };
    const verifier = await this.crypto.sha256Hex(`lunacare:pwd:${password}`);
    const result = await this.establishSession(session, password, salt, {
      kind: 'email',
      identifier: session.email ?? '',
      verifier,
      token: null,
    });
    if (result === 'EMAIL_TAKEN') {
      // Rollback: no dejar cuenta local fantasma.
      this.storage.clearCreds();
      this.cycle.detach();
      this.session.set(null);
      this.vaultKey = null;
      this.syncAuth = null;
      this.sync.setCredentials(null);
      return { ok: false, error: 'Ese correo ya tiene una cuenta.' };
    }
    return { ok: true };
  }

  async loginEmail(email: string, password: string): Promise<AuthResult> {
    const emailNorm = email.toLowerCase();
    const verifier = await this.crypto.sha256Hex(`lunacare:pwd:${password}`);

    const res = await this.api.loginEmail(emailNorm, verifier);
    if (res.kind === 'ok') {
      const session: Session = {
        userId: res.data.userId,
        mode: 'email',
        refCode: null,
        email: emailNorm,
        createdAt: Date.now(),
        googleLinked: res.data.googleLinked ?? false,
      };
      await this.adoptLogin(session, password, res.data.salt ?? '', {
        kind: 'email',
        identifier: emailNorm,
        verifier,
        token: res.data.token,
      });
      return { ok: true };
    }

    // El servidor no conoce la cuenta (se creó offline o la BD se reinició)
    // o está caído: probamos con la copia local de este dispositivo.
    if (res.kind === 'offline' || res.error === 'INVALID_CREDENTIALS') {
      return this.localEmailLogin(emailNorm, password, verifier);
    }
    return {
      ok: false,
      error: friendly(res.error),
      ...(res.error === 'TOO_MANY_ATTEMPTS' ? { retryAfter: res.retryAfter } : {}),
    };
  }

  // ---------------------------------------------------------------- Google

  /**
   * Primer paso del inicio con Google: el servidor verifica el ID token y
   * devuelve la identidad + el token de sincronización. La bóveda sigue
   * cerrada: falta el secreto local (PIN o contraseña).
   */
  async signInWithGoogle(credential: string): Promise<GoogleStartResult> {
    const res = await this.api.authGoogle(credential);
    if (res.kind === 'offline') {
      return { ok: false, error: 'No pudimos contactar con el servidor de sincronización.' };
    }
    if (res.kind === 'server-error') {
      return {
        ok: false,
        error: friendly(res.error),
        ...(res.error === 'TOO_MANY_ATTEMPTS' ? { retryAfter: res.retryAfter } : {}),
      };
    }

    const d = res.data;
    const email = d.email.toLowerCase();
    const mode: Exclude<AuthMode, 'anonymous'> = d.mode === 'email' ? 'email' : 'google';

    // El salt PBKDF2 viene del servidor y no es secreto: guardarlo en el índice
    // local permite re-derivar la clave tras recargar la app.
    this.storage.saveIndexEntry({
      lookup: await this.crypto.sha256Hex(`lunacare:lookup:${email}`),
      userId: d.userId,
      mode,
      salt: d.salt,
    });

    this.session.set({
      userId: d.userId,
      mode,
      refCode: null,
      email,
      createdAt: Date.now(),
      googleLinked: true,
    });
    this.syncAuth = { kind: 'google', identifier: email, verifier: '', token: d.token };
    this.sync.setCredentials(this.syncAuth);
    this.locked.set(true);
    this.googlePending.set({ email, mode, newAccount: d.newAccount });
    return { ok: true, next: d.newAccount ? 'setPin' : 'unlock' };
  }

  /** Cancela un inicio con Google a medias (volver atrás o cambiar de cuenta). */
  cancelGoogle(): void {
    if (!this.googlePending()) return;
    this.googlePending.set(null);
    this.session.set(null);
    this.locked.set(false);
    this.syncAuth = null;
    this.sync.setCredentials(null);
    this.cycle.detach();
  }

  /**
   * Vincula Google a la cuenta con correo abierta. No re-cifra nada: la clave
   * sigue derivándose de la contraseña; Google solo añade una identidad
   * alternativa ante el servidor.
   */
  async linkGoogle(credential: string): Promise<AuthResult> {
    const s = this.session();
    if (!s) return { ok: false, error: 'Sesión no válida.' };
    if (s.mode !== 'email') {
      return {
        ok: false,
        error:
          'Primero vincula un correo electrónico a tu cuenta: Google necesita un correo de referencia.',
      };
    }
    if (!this.syncAuth?.token) {
      return {
        ok: false,
        error: 'Tu sesión del servidor ha caducado: vuelve a entrar y reinténtalo.',
      };
    }

    const res = await this.api.linkGoogle(this.syncAuth.token, credential);
    if (res.kind === 'offline') {
      return { ok: false, error: 'Sin conexión con el servidor de sincronización.' };
    }
    if (res.kind === 'server-error') return { ok: false, error: friendly(res.error) };

    const session: Session = { ...s, googleLinked: true };
    this.session.set(session);
    this.storage.saveCreds({ session, syncAuth: this.syncAuth }, this.remember());
    return { ok: true };
  }

  async recoverAnonymous(refCodeInput: string, pin: string): Promise<AuthResult> {
    const normalized = normalizeRef(refCodeInput);
    if (normalized.length < 8)
      return { ok: false, error: 'Introduce tu código de referencia completo.' };
    const refHash = await this.crypto.sha256Hex(`lunacare:ref:${normalized}`);
    const pinVerifier = await this.crypto.sha256Hex(`lunacare:pin:${pin}`);

    const res = await this.api.loginAnon(refHash, pinVerifier);
    if (res.kind === 'ok') {
      const session: Session = {
        userId: res.data.userId,
        mode: 'anonymous',
        refCode: normalized,
        email: null,
        createdAt: Date.now(),
      };
      await this.adoptLogin(session, pin, normalized, {
        kind: 'anon',
        identifier: refHash,
        verifier: pinVerifier,
        token: res.data.token,
      });
      return { ok: true };
    }

    // El servidor no conoce el código (cuenta creada offline o BD reiniciada)
    // o está caído: probamos con la copia local de este dispositivo.
    if (res.kind === 'offline' || res.error === 'INVALID_CREDENTIALS') {
      return this.localAnonLogin(normalized, refHash, pin, pinVerifier);
    }
    return {
      ok: false,
      error: friendly(res.error),
      ...(res.error === 'TOO_MANY_ATTEMPTS' ? { retryAfter: res.retryAfter } : {}),
    };
  }

  /** Vincula la cuenta anónima a un correo (conserva todos los datos). */
  async linkEmail(email: string, password: string): Promise<AuthResult> {
    const s = this.session();
    if (!s || s.mode !== 'anonymous' || !this.vaultKey)
      return { ok: false, error: 'Sesión no válida.' };
    const emailNorm = email.toLowerCase();
    const salt = this.crypto.randomSalt();
    const verifier = await this.crypto.sha256Hex(`lunacare:pwd:${password}`);
    const newKey = await this.crypto.deriveKey(password, salt);

    if (this.syncAuth?.token) {
      const res = await this.api.linkEmail(this.syncAuth.token, emailNorm, verifier, salt);
      if (res.kind === 'server-error') return { ok: false, error: friendly(res.error) };
    }

    this.vaultKey = newKey;
    this.cycle.attach(s.userId, newKey);
    const syncAuth: SyncAuth = {
      kind: 'email',
      identifier: emailNorm,
      verifier,
      token: this.syncAuth?.token ?? null,
    };
    this.syncAuth = syncAuth;
    this.sync.setCredentials(syncAuth);
    const session: Session = { ...s, mode: 'email', email: emailNorm };
    this.storage.saveCreds({ session, syncAuth }, this.remember());
    this.storage.saveIndexEntry({
      lookup: await this.crypto.sha256Hex(`lunacare:lookup:${emailNorm}`),
      userId: s.userId,
      mode: 'email',
      salt,
    });
    this.session.set(session);
    void this.cycle.persist(); // re-cifra y sube la bóveda con la nueva clave
    return { ok: true };
  }

  async setRemember(v: boolean): Promise<void> {
    this.remember.set(v);
    this.storage.savePrefs({ ...this.storage.prefs(), remember: v });
    const s = this.session();
    if (s) {
      this.storage.saveCreds({ session: s, syncAuth: this.syncAuth }, v);
    }
  }

  async setSyncEnabled(v: boolean): Promise<void> {
    this.storage.savePrefs({ ...this.storage.prefs(), syncEnabled: v });
    if (v) {
      await this.sync.ping();
      if (this.session()) void this.cycle.persist();
    } else {
      this.sync.status.set('disabled');
    }
  }

  async logout(): Promise<void> {
    this.storage.clearCreds();
    this.session.set(null);
    this.googlePending.set(null);
    this.locked.set(false);
    this.vaultKey = null;
    this.syncAuth = null;
    this.cycle.detach();
    this.sync.setCredentials(null);
  }

  async wipeEverything(): Promise<void> {
    await this.logout();
    this.storage.wipeAll();
  }

  // ------------------------------------------------------------------ internals

  private async establishSession(
    session: Session,
    secret: string,
    salt: string,
    syncAuth: SyncAuth,
  ): Promise<'ok' | 'EMAIL_TAKEN'> {
    const key = await this.crypto.deriveKey(secret, salt);
    this.vaultKey = key;
    this.cycle.attach(session.userId, key);

    // Registro en servidor (si está disponible) para recuperar desde otro dispositivo.
    let serverResult: 'ok' | 'EMAIL_TAKEN' = 'ok';
    if (syncAuth.kind === 'anon') {
      const res = await this.api.registerAnon(syncAuth.identifier, syncAuth.verifier);
      if (res.kind === 'ok') syncAuth = { ...syncAuth, token: res.data.token };
    } else {
      const res = await this.api.registerEmail(syncAuth.identifier, syncAuth.verifier, salt);
      if (res.kind === 'ok') syncAuth = { ...syncAuth, token: res.data.token };
      if (res.kind === 'server-error' && res.error === 'EMAIL_TAKEN') serverResult = 'EMAIL_TAKEN';
    }
    this.syncAuth = syncAuth;
    this.sync.setCredentials(syncAuth);

    await this.cycle.initVault();

    const prefs = this.storage.prefs();
    this.remember.set(prefs.remember);
    this.locked.set(false);
    this.storage.saveCreds({ session, syncAuth }, prefs.remember);
    this.storage.saveIndexEntry({
      lookup:
        syncAuth.kind === 'anon'
          ? syncAuth.identifier
          : await this.crypto.sha256Hex(`lunacare:lookup:${syncAuth.identifier}`),
      userId: session.userId,
      mode: session.mode,
      salt: syncAuth.kind === 'email' ? salt : '',
    });
    this.session.set(session);
    void this.cycle.reconcileWithServer(); // sube la bóveda inicial
    return serverResult;
  }

  /**
   * Recuperación local de una cuenta anónima usando el índice cifrado de este
   * dispositivo (para cuentas creadas sin servidor o cuando la BD se reinició).
   * El PIN correcto es el único capaz de descifrar la bóveda local: eso valida
   * las credenciales sin revelar nada al servidor. Después auto-registra la
   * cuenta en el servidor para (re)activar la sincronización multi-dispositivo.
   */
  private async localAnonLogin(
    normalized: string,
    refHash: string,
    pin: string,
    pinVerifier: string,
  ): Promise<AuthResult> {
    const entry = this.storage.index().find((e) => e.lookup === refHash);
    if (!entry) {
      return {
        ok: false,
        error:
          'No encontramos ese código en el servidor ni en este dispositivo. Revisa el código e inténtalo de nuevo.',
      };
    }
    const key = await this.crypto.deriveKey(pin, normalized);
    this.vaultKey = key;
    this.cycle.attach(entry.userId, key);
    const loaded = await this.cycle.loadLocal();
    this.cycle.detach();
    this.vaultKey = null;
    if (!loaded) return { ok: false, error: 'El PIN no coincide con este código de referencia.' };

    let token: string | null = null;
    const reg = await this.api.registerAnon(refHash, pinVerifier);
    if (reg.kind === 'ok') {
      token = reg.data.token;
    } else {
      const lg = await this.api.loginAnon(refHash, pinVerifier);
      if (lg.kind === 'ok') token = lg.data.token;
    }
    const session: Session = {
      userId: entry.userId,
      mode: 'anonymous',
      refCode: normalized,
      email: null,
      createdAt: Date.now(),
    };
    await this.adoptLogin(session, pin, normalized, {
      kind: 'anon',
      identifier: refHash,
      verifier: pinVerifier,
      token,
    });
    return { ok: true };
  }

  /** Recuperación local de una cuenta con correo (mismo principio). */
  private async localEmailLogin(
    emailNorm: string,
    password: string,
    verifier: string,
  ): Promise<AuthResult> {
    const lookup = await this.crypto.sha256Hex(`lunacare:lookup:${emailNorm}`);
    const entry = this.storage.index().find((e) => e.lookup === lookup);
    if (!entry) return { ok: false, error: 'Credenciales incorrectas.' };
    const key = await this.crypto.deriveKey(password, entry.salt);
    this.vaultKey = key;
    this.cycle.attach(entry.userId, key);
    const loaded = await this.cycle.loadLocal();
    this.cycle.detach();
    this.vaultKey = null;
    if (!loaded) return { ok: false, error: 'Credenciales incorrectas.' };

    let token: string | null = null;
    const reg = await this.api.registerEmail(emailNorm, verifier, entry.salt);
    if (reg.kind === 'ok') {
      token = reg.data.token;
    } else {
      const lg = await this.api.loginEmail(emailNorm, verifier);
      if (lg.kind === 'ok') token = lg.data.token;
    }
    const session: Session = {
      userId: entry.userId,
      mode: 'email',
      refCode: null,
      email: emailNorm,
      createdAt: Date.now(),
    };
    await this.adoptLogin(session, password, entry.salt, {
      kind: 'email',
      identifier: emailNorm,
      verifier,
      token,
    });
    return { ok: true };
  }

  private async adoptLogin(
    session: Session,
    secret: string,
    salt: string,
    syncAuth: SyncAuth,
  ): Promise<void> {
    const key = await this.crypto.deriveKey(secret, salt);
    this.vaultKey = key;
    this.syncAuth = syncAuth;
    this.cycle.attach(session.userId, key);
    this.sync.setCredentials(syncAuth);

    await this.cycle.loadLocal();
    // Concilia siempre: adopta la bóveda remota si es más nueva o sube la local;
    // de paso actualiza el estado de sincronización nada más entrar.
    await this.cycle.reconcileWithServer();
    if (!this.cycle.vault()) await this.cycle.initVault();

    const prefs = this.storage.prefs();
    this.remember.set(prefs.remember);
    this.locked.set(false);
    this.storage.saveCreds({ session, syncAuth }, prefs.remember);
    this.session.set(session);
  }
}

export function normalizeRef(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function friendly(error: string): string {
  switch (error) {
    case 'EMAIL_TAKEN':
      return 'Ese correo ya tiene una cuenta.';
    case 'REF_TAKEN':
      return 'Ese código ya está registrado.';
    case 'INVALID_CREDENTIALS':
      return 'Credenciales incorrectas.';
    case 'UNAUTHORIZED':
      return 'Tu sesión del servidor ha caducado.';
    case 'ALREADY_LINKED':
      return 'Esta cuenta ya está vinculada a un correo.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    case 'GOOGLE_NOT_CONFIGURED':
      return 'El inicio con Google no está configurado todavía.';
    case 'GOOGLE_UNAVAILABLE':
      return 'Google no está disponible ahora mismo. Inténtalo más tarde o usa correo y contraseña.';
    case 'GOOGLE_TOKEN_INVALID':
    case 'GOOGLE_TOKEN_EXPIRED':
      return 'No pudimos verificar tu cuenta de Google. Inténtalo de nuevo.';
    case 'GOOGLE_NO_EMAIL':
    case 'GOOGLE_EMAIL_UNVERIFIED':
      return 'Esa cuenta de Google no tiene un correo verificado.';
    case 'EMAIL_EXISTS':
      return 'Ese correo ya tiene una cuenta. Entra con tu contraseña y vincula Google desde Ajustes.';
    case 'GOOGLE_LINK_NEEDS_EMAIL':
      return 'Vincula primero un correo electrónico a tu cuenta.';
    case 'GOOGLE_EMAIL_MISMATCH':
      return 'La cuenta de Google debe usar el mismo correo que tu cuenta de LunaCare.';
    case 'GOOGLE_TAKEN':
      return 'Esa cuenta de Google ya está vinculada a otra cuenta de LunaCare.';
    default:
      return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
}
