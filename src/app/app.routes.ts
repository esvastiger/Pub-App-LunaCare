import { Routes } from '@angular/router';
import { appGuard, onboardingGuard, unlockGuard, welcomeGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  {
    path: 'inicio',
    canActivate: [welcomeGuard],
    loadComponent: () => import('./features/auth/auth').then((m) => m.Auth),
  },
  {
    path: 'desbloquear',
    canActivate: [unlockGuard],
    loadComponent: () => import('./features/unlock/unlock').then((m) => m.Unlock),
  },
  {
    path: 'onboarding',
    canActivate: [onboardingGuard],
    loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding),
  },
  {
    path: 'app',
    canActivate: [appGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'estadisticas',
        loadComponent: () => import('./features/statistics/statistics').then((m) => m.Statistics),
      },
      {
        path: 'asistente',
        loadComponent: () => import('./features/assistant/assistant').then((m) => m.Assistant),
      },
      {
        path: 'ajustes',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];
