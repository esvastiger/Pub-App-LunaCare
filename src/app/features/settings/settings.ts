import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { CycleService } from '../../core/cycle.service';
import { SyncService } from '../../core/sync.service';
import { GoogleAuthService } from '../../core/google-auth.service';
import { StorageService } from '../../core/storage.service';
import { copyText, downloadText } from '../../core/dom-utils';
import { Icon, Modal, ToastService, Toggle } from '../../shared/ui';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, Icon, Modal, Toggle],
  templateUrl: './settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly auth = inject(AuthService);
  readonly cycle = inject(CycleService);
  private readonly sync = inject(SyncService);
  private readonly google = inject(GoogleAuthService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);

  readonly showCode = signal(false);
  readonly linkOpen = signal(false);
  readonly wipeOpen = signal(false);
  readonly busy = signal(false);
  /** Panel con el botón oficial de Google para vincular la cuenta. */
  readonly linkGoogleReady = signal(false);
  readonly googleMountLink = viewChild<ElementRef<HTMLElement>>('googleMountLink');

  readonly session = this.auth.session;
  readonly isAnonymous = this.auth.isAnonymous;
  readonly googleLinked = computed(() => !!this.session()?.googleLinked);
  /** Google solo puede vincularse a cuentas con correo: en modo anónimo el salt es el código. */
  readonly canLinkGoogle = computed(() => this.session()?.mode === 'email' && !this.googleLinked());
  readonly accountLabel = computed(() => {
    switch (this.session()?.mode) {
      case 'anonymous':
        return 'Cuenta anónima';
      case 'google':
        return 'Cuenta de Google';
      default:
        return 'Cuenta con correo';
    }
  });
  readonly syncEnabled = signal(this.auth.prefs().syncEnabled);
  readonly syncStatus = this.sync.status;
  readonly lastSyncAt = this.sync.lastSyncAt;

  /** Host del servidor configurado (sin credenciales ni ruta). */
  readonly apiHost = computed(() => {
    const base = this.storage.apiBase();
    try {
      return new URL(base).host || base;
    } catch {
      return base;
    }
  });

  /**
   * Dónde está la copia remota en este instante. Es la pieza que explica a la
   * usuaria si sus datos solo viven en el dispositivo o también fuera de él.
   */
  readonly remoteState = computed<'local' | 'remote' | 'syncing' | 'offline' | 'error'>(() => {
    if (!this.syncEnabled()) return 'local';
    switch (this.syncStatus()) {
      case 'synced':
        return 'remote';
      case 'syncing':
        return 'syncing';
      case 'error':
        return 'error';
      case 'offline':
        return 'offline';
      default:
        return 'local';
    }
  });

  readonly remoteLabel = computed(
    () =>
      ({
        remote: 'Sincronizado',
        syncing: 'Sincronizando…',
        offline: 'Sin conexión',
        error: 'Error del servidor',
        local: 'No se envía',
      })[this.remoteState()],
  );

  readonly remoteBadge = computed(
    () =>
      ({
        remote: 'bg-sage-400/15 text-sage-500',
        syncing: 'bg-lilac-300/25 text-plum-600',
        offline: 'bg-amber-50 text-amber-700',
        error: 'bg-rose-50 text-rose-600',
        local: 'bg-nude-100 text-plum-500',
      })[this.remoteState()],
  );

  readonly remoteDetail = computed(() => {
    const host = this.apiHost();
    const at = this.lastSyncAt();
    const hora = at
      ? new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '';
    switch (this.remoteState()) {
      case 'remote':
        return `Copia cifrada en ${host}${hora ? ` · último envío a las ${hora}` : ''}. Tus registros completos siguen también en este dispositivo.`;
      case 'syncing':
        return `Subiendo una copia cifrada a ${host}. Hasta que termine, los cambios están solo en este dispositivo.`;
      case 'offline':
        return `Sin conexión con ${host}: ahora tus cambios solo están en este dispositivo y se enviarán al recuperar la conexión.`;
      case 'error':
        return `${host} no responde: los cambios nuevos siguen solo en este dispositivo. La última copia remota no se ha perdido.`;
      default:
        return `Sincronización desactivada: no se envía ninguna copia a ${host} ni a ningún otro sitio.`;
    }
  });

  /** Google nunca aloja la bóveda; solo se muestra si la cuenta lo usa. */
  readonly hasGoogleIdentity = computed(
    () => this.session()?.mode === 'google' || this.googleLinked(),
  );

  readonly linkForm = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required, Validators.minLength(8)]),
  });

  async copyCode(): Promise<void> {
    const code = this.session()?.refCode;
    if (code && (await copyText(code))) this.toast.success('Código copiado al portapapeles');
  }

  downloadCode(): void {
    const code = this.session()?.refCode;
    if (!code) return;
    downloadText(
      'lunacare-codigo-de-referencia.txt',
      [
        'LunaCare · Tu código de referencia',
        '==================================',
        '',
        `Código: ${code}`,
        '',
        'Guárdalo junto con tu PIN: son la única forma de recuperar tus datos',
        'si no vinculas un correo electrónico a tu cuenta.',
      ].join('\n'),
    );
    this.toast.success('Archivo descargado');
  }

  async toggleSync(v: boolean): Promise<void> {
    this.syncEnabled.set(v);
    await this.auth.setSyncEnabled(v);
    this.toast.info(
      v ? 'Sincronización activada' : 'Sincronización desactivada: solo datos locales',
    );
  }

  async toggleRemember(v: boolean): Promise<void> {
    await this.auth.setRemember(v);
    this.toast.info(v ? 'Sesión recordada en este dispositivo' : 'Sesión solo para esta pestaña');
  }

  openLink(): void {
    this.linkForm.reset();
    this.linkOpen.set(true);
  }

  async link(): Promise<void> {
    if (this.linkForm.invalid) {
      this.linkForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const { email, password } = this.linkForm.getRawValue();
      const r = await this.auth.linkEmail(email, password);
      if (!r.ok) {
        this.toast.error(r.error ?? 'No se pudo vincular');
        return;
      }
      this.linkOpen.set(false);
      this.toast.success('Cuenta vinculada · Tus datos se han re-cifrado 🌙');
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Vincula Google en dos pasos: el clic carga GIS bajo demanda y pinta el
   * botón oficial; al pulsarlo, Google abre su selector de cuentas.
   */
  async startLinkGoogle(): Promise<void> {
    if (this.busy() || this.linkGoogleReady()) return;
    this.linkGoogleReady.set(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const mount = this.googleMountLink()?.nativeElement;
    if (!mount) {
      this.linkGoogleReady.set(false);
      return;
    }

    this.busy.set(true);
    try {
      const res = await this.google.mountButton(mount, (credential) => {
        void this.completeLinkGoogle(credential);
      });
      if (!res.ok) {
        this.linkGoogleReady.set(false);
        this.toast.error(res.error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  cancelLinkGoogle(): void {
    this.linkGoogleReady.set(false);
  }

  private async completeLinkGoogle(credential: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await this.auth.linkGoogle(credential);
      if (!r.ok) {
        this.toast.error(r.error ?? 'No se pudo vincular Google');
        return;
      }
      this.linkGoogleReady.set(false);
      this.toast.success('Google vinculado · Entra con Google y tu PIN o contraseña 🌙');
    } finally {
      this.busy.set(false);
    }
  }

  exportData(): void {
    downloadText(
      `lunacare-export-${new Date().toISOString().slice(0, 10)}.json`,
      this.cycle.exportJson(),
      'application/json',
    );
    this.toast.success('Copia de seguridad descargada (sin cifrar: guárdala segura)');
  }

  openWipe(): void {
    this.wipeOpen.set(true);
  }

  async wipe(): Promise<void> {
    await this.auth.wipeEverything();
    this.wipeOpen.set(false);
    this.toast.info('Todos los datos locales han sido borrados');
    location.assign('/inicio');
  }
}
