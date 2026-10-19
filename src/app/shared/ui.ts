import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

// --------------------------------------------------------------------- Iconos

export type IconName =
  | 'moon'
  | 'calendar'
  | 'chart'
  | 'gear'
  | 'logout'
  | 'copy'
  | 'download'
  | 'check'
  | 'x'
  | 'left'
  | 'right'
  | 'plus'
  | 'shield'
  | 'refresh'
  | 'mail'
  | 'trash'
  | 'info'
  | 'lock'
  | 'eye'
  | 'eyeOff'
  | 'spark';

const PATHS: Record<IconName, string> = {
  moon: 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z',
  calendar:
    'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  chart:
    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  gear: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75',
  logout:
    'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9',
  copy: 'M15.66 6.26a8.25 8.25 0 00-1.41-1.13L13 4.5H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.415 7.135H18.75c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m8.66 6.135v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376H8.25a1.125 1.125 0 01-1.125-1.125v-6.25',
  download:
    'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  check: 'M4.5 12.75l6 6 9-13.5',
  x: 'M6 18L18 6M6 6l12 12',
  left: 'M15.75 19.5L8.25 12l7.5-7.5',
  right: 'M8.25 4.5l7.5 7.5-7.5 7.5',
  plus: 'M12 4.5v15m7.5-7.5h-15',
  shield:
    'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  refresh:
    'M16.023 9.348h4.992V4.356m0 4.992l-3.181-3.183a8.25 8.25 0 00-13.803 3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99m-4.038 9.349a8.25 8.25 0 01-13.803-3.7M2.985 19.644v-4.99h4.992m-4.992 0l3.181 3.183',
  mail: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  trash:
    'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  info: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
  lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  eye: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  eyeOff:
    'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88',
  spark:
    'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-[1em] w-[1em]"
      aria-hidden="true"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  host: { class: 'inline-flex shrink-0 leading-none' },
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly path = computed(() => PATHS[this.name()]);
}

// ---------------------------------------------------------------------- Modal

@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
        <div
          class="animate-fade absolute inset-0 bg-plum-900/40 backdrop-blur-sm"
          (click)="close()"
        ></div>
        <section
          class="card animate-pop relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl shadow-float sm:rounded-3xl"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title() || 'Diálogo'"
        >
          <!-- Asa de arrastre (bottom-sheet en móvil) -->
          <div class="flex shrink-0 justify-center bg-white/60 pt-2.5 sm:hidden">
            <span class="h-1.5 w-11 rounded-full bg-plum-900/15"></span>
          </div>
          <div
            class="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pb-4 sm:pt-5"
            style="padding-top: max(0.75rem, env(safe-area-inset-top));"
          >
            <h2 class="font-display text-lg font-bold text-plum-800">{{ title() }}</h2>
            <button
              type="button"
              class="-mr-2 -mt-1 rounded-full p-2.5 text-plum-400 transition hover:bg-blush-50 hover:text-plum-600"
              (click)="close()"
              aria-label="Cerrar"
            >
              <app-icon name="x" class="text-lg" />
            </button>
          </div>
          <div
            class="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6"
          >
            <ng-content />
          </div>
        </section>
      </div>
    }
  `,
  host: { '(document:keydown.escape)': 'onEsc()' },
})
export class Modal {
  readonly open = model.required<boolean>();
  readonly title = input('');

  close(): void {
    this.open.set(false);
  }

  onEsc(): void {
    if (this.open()) this.close();
  }
}

// --------------------------------------------------------------------- Toggle

@Component({
  selector: 'app-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      (click)="toggle()"
      class="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition"
      [class]="checked() ? 'bg-linear-to-r from-blush-400 to-lilac-400' : 'bg-plum-900/15'"
    >
      <span
        class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
        [class.translate-x-6]="checked()"
        [class.translate-x-1]="!checked()"
      ></span>
    </button>
  `,
})
export class Toggle {
  readonly checked = model.required<boolean>();

  toggle(): void {
    this.checked.set(!this.checked());
  }
}

// --------------------------------------------------------------------- Toasts

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'success' | 'error' | 'info';
  /** Acciones opcionales (p. ej. "Recargar" en el aviso de nueva versión). */
  actions?: ToastAction[];
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, kind: Toast['kind'] = 'success', ms = 3400, actions?: ToastAction[]): number {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, text, kind, actions }]);
    if (ms > 0) {
      setTimeout(() => this.dismiss(id), ms);
    }
    return id;
  }

  /** Añade acciones a un toast ya visible (sin reiniciar su temporizador). */
  addActions(id: number, actions: ToastAction[]): void {
    this.toasts.update((t) => t.map((x) => (x.id === id ? { ...x, actions } : x)));
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  runAction(toast: Toast, action: ToastAction): void {
    this.dismiss(toast.id);
    action.run();
  }

  success(text: string): void {
    this.show(text, 'success');
  }
  error(text: string): void {
    this.show(text, 'error');
  }
  info(text: string): void {
    this.show(text, 'info');
  }
}

@Component({
  selector: 'app-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      @for (t of toasts(); track t.id) {
        <div
          class="animate-pop flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-float"
          [class]="
            t.kind === 'error'
              ? 'bg-rose-500/95'
              : t.kind === 'info'
                ? 'bg-lilac-500/95'
                : 'bg-plum-800/95'
          "
        >
          <span class="text-base leading-none">{{
            t.kind === 'success' ? '✓' : t.kind === 'info' ? '🌙' : '!'
          }}</span>
          <span>{{ t.text }}</span>
          @if (t.actions; as actions) {
            @for (a of actions; track a.label) {
              <button
                type="button"
                class="pointer-events-auto rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-plum-800 transition hover:bg-white"
                (click)="runAction(t, a)"
              >
                {{ a.label }}
              </button>
            }
          }
        </div>
      }
    </div>
  `,
})
export class Toasts {
  private readonly toastService = inject(ToastService);
  readonly toasts = this.toastService.toasts;

  runAction(toast: Toast, action: ToastAction): void {
    this.toastService.runAction(toast, action);
  }
}
