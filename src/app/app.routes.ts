import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Log in | Dental Clinic Decision Support',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'retention',
    title: 'Patient retention | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/retention/retention').then((m) => m.Retention),
  },
  {
    path: 'revenue',
    title: 'Revenue and services | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/revenue/revenue').then((m) => m.Revenue),
  },
  { path: '', pathMatch: 'full', redirectTo: 'retention' },
  { path: '**', redirectTo: 'retention' },
];
