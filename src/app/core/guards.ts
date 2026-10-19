import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { CycleService } from './cycle.service';

/** Para /inicio: si ya hay sesión, redirige a desbloqueo, onboarding o app. */
export const welcomeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const cycle = inject(CycleService);
  const router = inject(Router);
  if (!auth.session()) return true;
  if (auth.locked()) return router.createUrlTree(['/desbloquear']);
  return cycle.settings()?.onboarded
    ? router.createUrlTree(['/app'])
    : router.createUrlTree(['/onboarding']);
};

/** Para /onboarding: exige sesión desbloqueada y salta si ya está configurado. */
export const onboardingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const cycle = inject(CycleService);
  const router = inject(Router);
  if (!auth.session()) return router.createUrlTree(['/inicio']);
  if (auth.locked()) return router.createUrlTree(['/desbloquear']);
  return cycle.settings()?.onboarded ? router.createUrlTree(['/app']) : true;
};

/** Para /app: exige sesión desbloqueada y onboarding completado. */
export const appGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const cycle = inject(CycleService);
  const router = inject(Router);
  if (!auth.session()) return router.createUrlTree(['/inicio']);
  if (auth.locked()) return router.createUrlTree(['/desbloquear']);
  if (!cycle.settings()?.onboarded) return router.createUrlTree(['/onboarding']);
  return true;
};

/** Para /desbloquear: solo tiene sentido con sesión recordada y bóveda cerrada. */
export const unlockGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const cycle = inject(CycleService);
  const router = inject(Router);
  if (!auth.session()) return router.createUrlTree(['/inicio']);
  if (!auth.locked()) {
    return cycle.settings()?.onboarded
      ? router.createUrlTree(['/app'])
      : router.createUrlTree(['/onboarding']);
  }
  return true;
};
