import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LoginGate } from '../../core/gate';
import { GoogleAuthService } from '../../core/google-auth.service';
import { copyText, downloadText } from '../../core/dom-utils';
import { Icon, ToastService } from '../../shared/ui';

type Step = 'choose' | 'anonPin' | 'anonCode' | 'googleSetup' | 'googleUnlock' | 'recover';

@Component({
  selector: 'app-auth',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './auth.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Auth {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly google = inject(GoogleAuthService);

  readonly step = signal<Step>('choose');
  readonly formMode = signal<'register' | 'login'>('register');
  readonly busy = signal(false);
  readonly showPassword = signal(false);
  readonly refCode = signal<string | null>(null);
  readonly codeSaved = signal(false);

  readonly emailForm = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required, Validators.minLength(8)]),
  });

  readonly pinForm = this.fb.group(
    {
      pin: this.fb.control('', [Validators.required, Validators.pattern(/^\d{4,8}$/)]),
      pin2: this.fb.control('', [Validators.required]),
    },
    { validators: pinMatch },
  );

  readonly recoverForm = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.pattern(/^[A-Za-z0-9\- ]{8,24}$/)]),
    pin: this.fb.control('', [Validators.required, Validators.pattern(/^\d{4,8}$/)]),
  });

  /** Identidad de Google validada por el servidor, a la espera del secreto local. */
  readonly googlePending = this.auth.googlePending;
  /** Con cuenta de Google el secreto es un PIN; con correo vinculado, la contraseña. */
  readonly googleNeedsPin = computed(() => this.googlePending()?.mode !== 'email');
  readonly googleForm = this.fb.group({
    secret: this.fb.control('', [Validators.required]),
  });
  /** Contenedor donde GIS pinta su botón oficial (solo tras el primer clic). */
  readonly googleMount = viewChild<ElementRef<HTMLElement>>('googleMount');
  readonly googleReady = signal(false);

  /** Porteros anti fuerza-bruta (persisten en localStorage aunque se recargue). */
  readonly recoverGate = new LoginGate('recover');
  readonly emailGate = new LoginGate('email');
  readonly googleGate = new LoginGate('google');
  /** Formato mm:ss usable desde la plantilla. */
  readonly LoginGateFmt = LoginGate.fmt;

  private readonly passwordRaw = toSignal(this.emailForm.controls.password.valueChanges, {
    initialValue: '',
  });
  readonly passwordStrength = computed(() => scorePassword(this.passwordRaw()));
  readonly strengthColor = computed(() => {
    const s = this.passwordStrength().score;
    return s >= 3 ? 'bg-sage-400' : s === 2 ? 'bg-lilac-300' : 'bg-blush-300';
  });

  invalid(c: AbstractControl): boolean {
    return c.invalid && (c.dirty || c.touched);
  }

  digits(e: Event, c: FormControl<string>): void {
    c.setValue((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8));
  }

  // ----------------------------------------------------------- modo anónimo

  startAnonymous(): void {
    this.pinForm.reset();
    this.step.set('anonPin');
  }

  async confirmPin(): Promise<void> {
    if (this.pinForm.invalid) {
      this.pinForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const session = await this.auth.createAnonymous(this.pinForm.getRawValue().pin);
      this.refCode.set(session.refCode);
      this.codeSaved.set(false);
      this.step.set('anonCode');
    } finally {
      this.busy.set(false);
    }
  }

  async copyCode(): Promise<void> {
    if (await copyText(this.refCode() ?? '')) this.toast.success('Código copiado al portapapeles');
  }

  downloadCode(): void {
    const code = this.refCode() ?? '';
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
        '',
        `Generado: ${new Date().toLocaleString('es-ES')}`,
      ].join('\n'),
    );
    this.toast.success('Archivo descargado');
  }

  finishAnonymous(): void {
    if (!this.codeSaved()) return;
    void this.router.navigateByUrl('/onboarding');
  }

  // -------------------------------------------------------------- recuperar

  goRecover(): void {
    this.recoverForm.reset();
    this.step.set('recover');
  }

  backToChoose(): void {
    this.googleReady.set(false);
    this.auth.cancelGoogle();
    this.step.set('choose');
  }

  async recover(): Promise<void> {
    if (this.recoverForm.invalid) {
      this.recoverForm.markAllAsTouched();
      return;
    }
    if (!this.recoverGate.check()) return; // bloqueo activo: ignorar el submit
    this.busy.set(true);
    try {
      const { code, pin } = this.recoverForm.getRawValue();
      const r = await this.auth.recoverAnonymous(code, pin);
      if (!r.ok) {
        if (r.retryAfter && r.retryAfter > 0) {
          this.recoverGate.penalize(r.retryAfter); // obedece al 429 del servidor
        } else {
          this.recoverGate.fail();
        }
        this.toast.error(r.error ?? 'No se pudo recuperar la sesión');
        return;
      }
      this.recoverGate.success();
      this.toast.success('Sesión recuperada · Bienvenida de vuelta 🌙');
      await this.router.navigateByUrl(
        this.auth.cycle.settings()?.onboarded ? '/app' : '/onboarding',
      );
    } finally {
      this.busy.set(false);
    }
  }

  // ------------------------------------------------------- correo / Google

  setFormMode(m: 'register' | 'login'): void {
    this.formMode.set(m);
  }

  async submitEmail(): Promise<void> {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    if (!this.emailGate.check()) return; // bloqueo activo: ignorar el submit
    this.busy.set(true);
    try {
      const { email, password } = this.emailForm.getRawValue();
      if (this.formMode() === 'register') {
        const r = await this.auth.registerEmail(email, password);
        if (!r.ok) {
          this.toast.error(r.error ?? 'No se pudo crear la cuenta');
          return;
        }
        await this.router.navigateByUrl('/onboarding');
      } else {
        const r = await this.auth.loginEmail(email, password);
        if (!r.ok) {
          if (r.retryAfter && r.retryAfter > 0) {
            this.emailGate.penalize(r.retryAfter);
          } else {
            this.emailGate.fail();
          }
          this.toast.error(r.error ?? 'No se pudo iniciar sesión');
          return;
        }
        this.emailGate.success();
        await this.router.navigateByUrl(
          this.auth.cycle.settings()?.onboarded ? '/app' : '/onboarding',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Inicio con Google en dos pasos: el clic carga GIS bajo demanda y pinta el
   * botón oficial; al pulsarlo, Google abre su selector (o el inicio de sesión
   * si el navegador no tiene cuenta). Después se pide el secreto local.
   */
  async goGoogle(): Promise<void> {
    if (this.busy() || this.googleReady()) return;
    this.googleReady.set(true);
    // Esperar a que Angular pinte el contenedor antes de montar el botón.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const mount = this.googleMount()?.nativeElement;
    if (!mount) {
      this.googleReady.set(false);
      return;
    }

    this.busy.set(true);
    try {
      const res = await this.google.mountButton(mount, (credential) => {
        void this.useGoogleCredential(credential);
      });
      if (!res.ok) {
        this.googleReady.set(false);
        this.toast.error(res.error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Cancela el panel del botón de Google y vuelve a la tarjeta normal. */
  cancelGooglePanel(): void {
    this.googleReady.set(false);
    this.auth.cancelGoogle();
  }

  /** Canjea la credencial de Google y decide el siguiente paso. */
  private async useGoogleCredential(credential: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await this.auth.signInWithGoogle(credential);
      if (!r.ok) {
        this.toast.error(r.error ?? 'No se pudo entrar con Google');
        return;
      }
      this.googleReady.set(false);
      if (r.next === 'setPin') {
        this.pinForm.reset();
        this.step.set('googleSetup');
      } else {
        this.googleForm.reset();
        this.step.set('googleUnlock');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Cuenta nueva con Google: el PIN elegido cifra la bóveda (nunca se envía). */
  async finishGoogleSetup(): Promise<void> {
    if (this.pinForm.invalid) {
      this.pinForm.markAllAsTouched();
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await this.auth.unlock(this.pinForm.getRawValue().pin);
      if (!r.ok) {
        this.toast.error(r.error ?? 'No se pudo crear tu bóveda');
        return;
      }
      this.toast.success('Cuenta de Google creada · Bienvenida 🌙');
      await this.router.navigateByUrl('/onboarding');
    } finally {
      this.busy.set(false);
    }
  }

  /** Cuenta existente: pide el PIN o la contraseña para descifrar la bóveda. */
  async finishGoogleUnlock(): Promise<void> {
    if (this.googleForm.invalid) {
      this.googleForm.markAllAsTouched();
      return;
    }
    if (!this.googleGate.check()) return;
    const secret = this.googleForm.getRawValue().secret;
    if (this.googleNeedsPin() && !/^\d{4,8}$/.test(secret)) {
      this.googleForm.controls.secret.setErrors({ pattern: true });
      return;
    }
    this.busy.set(true);
    try {
      const r = await this.auth.unlock(secret);
      if (!r.ok) {
        if (r.retryAfter && r.retryAfter > 0) {
          this.googleGate.penalize(r.retryAfter);
        } else {
          this.googleGate.fail();
        }
        this.toast.error(r.error ?? 'No se pudo desbloquear tu bóveda');
        this.googleForm.reset();
        return;
      }
      this.googleGate.success();
      await this.router.navigateByUrl(
        this.auth.cycle.settings()?.onboarded ? '/app' : '/onboarding',
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** Filtra dígitos en el campo PIN del desbloqueo con Google. */
  googleDigits(e: Event): void {
    if (!this.googleNeedsPin()) return;
    const el = e.target as HTMLInputElement;
    const clean = el.value.replace(/\D/g, '').slice(0, 8);
    if (clean !== el.value) {
      el.value = clean;
      this.googleForm.controls.secret.setValue(clean);
    }
  }
}

function pinMatch(g: AbstractControl): ValidationErrors | null {
  const a = g.get('pin')?.value;
  const b = g.get('pin2')?.value;
  return a && b && a === b ? null : { mismatch: true };
}

function scorePassword(p: string): { score: number; label: string } {
  if (!p) return { score: 0, label: '' };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12 || /[A-Z]/.test(p)) score++;
  if (/\d/.test(p) || /[^\w\s]/.test(p)) score++;
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Segura'];
  return { score, label: labels[score] };
}
