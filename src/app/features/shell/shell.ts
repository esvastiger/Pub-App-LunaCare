import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PwaService } from '../../core/pwa.service';
import { SyncService } from '../../core/sync.service';
import { copyText, downloadText } from '../../core/dom-utils';
import { Icon, IconName, ToastService } from '../../shared/ui';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly toast = inject(ToastService);
  private readonly pwa = inject(PwaService);
  private readonly router = inject(Router);

  readonly drawer = signal(false);
  readonly showCode = signal(false);
  readonly online = this.pwa.online;

  readonly session = this.auth.session;
  readonly syncStatus = this.sync.status;

  readonly nav: { path: string; label: string; icon: IconName }[] = [
    { path: '/app', label: 'Panel', icon: 'calendar' },
    { path: '/app/estadisticas', label: 'Estadísticas', icon: 'chart' },
    { path: '/app/asistente', label: 'Luna', icon: 'spark' },
    { path: '/app/ajustes', label: 'Ajustes', icon: 'gear' },
  ];

  /** Etiqueta corta: indica dónde está la copia de los datos. */
  readonly syncLabel = computed(
    () =>
      ({
        synced: 'Local + servidor',
        syncing: 'Sincronizando…',
        offline: 'Solo local',
        error: 'Solo local · error',
        disabled: 'Solo local',
      })[this.sync.status()],
  );

  readonly syncTitle = computed(
    () =>
      ({
        synced: 'Tus datos están cifrados en este dispositivo y en tu servidor de sincronización.',
        syncing: 'Enviando una copia cifrada al servidor. Mientras tanto, tus datos están aquí.',
        offline: 'Sin conexión con el servidor: tus datos solo están en este dispositivo.',
        error: 'El servidor no responde: tus datos solo están en este dispositivo.',
        disabled: 'Sincronización desactivada: tus datos solo existen en este dispositivo.',
      })[this.sync.status()],
  );

  readonly syncDot = computed(
    () =>
      ({
        synced: 'bg-sage-400',
        syncing: 'bg-lilac-400 animate-pulse',
        offline: 'bg-plum-200',
        error: 'bg-rose-400',
        disabled: 'bg-plum-100',
      })[this.sync.status()],
  );

  readonly maskedCode = computed(() => {
    const code = this.session()?.refCode;
    return code ? `LUNA-••••-••••` : '';
  });

  openDrawer(): void {
    this.drawer.set(true);
  }

  constructor() {
    // Aviso discreto al perder la conexión (no toast al recuperar, para no
    // duplicar ruido con el estado de sincronización del header).
    effect(() => {
      if (this.online() === false) {
        this.toast.info('Sin conexión · tus cambios se guardan en el dispositivo');
      }
    });
  }

  closeDrawer(): void {
    this.drawer.set(false);
    this.showCode.set(false);
  }

  async copyCode(): Promise<void> {
    const code = this.session()?.refCode;
    if (code && (await copyText(code))) this.toast.success('Código copiado al portapapeles');
  }

  downloadCode(): void {
    const code = this.session()?.refCode;
    if (!code) return;
    downloadText(
      'lunacare-codigo-de-referencia.txt',
      `LunaCare · Código de referencia\n\n${code}\n`,
    );
    this.toast.success('Archivo descargado');
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.closeDrawer();
    void this.router.navigateByUrl('/inicio');
  }
}
