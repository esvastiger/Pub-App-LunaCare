import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/ui';

/**
 * Pantalla de desbloqueo.
 *
 * La clave AES de la bóveda nunca se guarda: al recargar la app solo se
 * conserva la identidad de la sesión, así que aquí se pide el PIN (o la
 * contraseña) y se vuelve a derivar con PBKDF2. Un XSS que lea el
 * almacenamiento no obtiene nada descifrable.
 */
@Component({
  selector: 'app-unlock',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './unlock.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Unlock {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal('');

  readonly session = this.auth.session;
  readonly isAnonymous = this.auth.isAnonymous;
  /** Cuentas anónimas y de Google usan PIN; las de correo, contraseña. */
  readonly needsPin = computed(() => this.isAnonymous() || this.session()?.mode === 'google');
  readonly secretLabel = computed(() => (this.needsPin() ? 'PIN' : 'Contraseña'));

  /** Código de referencia parcialmente oculto, solo como pista visual. */
  readonly maskedRef = computed(() => {
    const code = this.session()?.refCode;
    if (!code) return '';
    return `${code.slice(0, 5)}••••-••••`;
  });

  readonly form = this.fb.group({
    secret: this.fb.control('', { validators: [Validators.required] }),
  });

  /** El PIN solo admite dígitos; la contraseña, cualquier carácter. */
  onInput(e: Event): void {
    if (!this.needsPin()) return;
    const el = e.target as HTMLInputElement;
    const clean = el.value.replace(/\D/g, '');
    if (clean !== el.value) {
      el.value = clean;
      this.form.controls.secret.setValue(clean);
    }
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.busy.set(true);
    try {
      const r = await this.auth.unlock(this.form.getRawValue().secret);
      if (!r.ok) {
        this.error.set(r.error ?? 'No se pudo desbloquear.');
        this.form.controls.secret.reset('');
        return;
      }
      await this.router.navigateByUrl('/app');
    } finally {
      this.busy.set(false);
    }
  }

  /** Cambiar de cuenta: cierra la sesión local y vuelve al inicio. */
  async useAnotherAccount(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/inicio');
  }
}
