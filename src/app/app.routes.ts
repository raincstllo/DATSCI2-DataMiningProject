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
    path: 'patients',
    title: 'Patients | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/patients/patient-list').then((m) => m.PatientList),
  },
  {
    path: 'patients/new',
    title: 'Add patient | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/patients/patient-form').then((m) => m.PatientForm),
  },
  {
    path: 'patients/:id',
    title: 'Patient | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/patients/patient-detail').then((m) => m.PatientDetailPage),
  },
  {
    path: 'patients/:id/edit',
    title: 'Edit patient | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/patients/patient-form').then((m) => m.PatientForm),
  },
  {
    path: 'visits',
    title: 'Visits | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/visits/visit-list').then((m) => m.VisitList),
  },
  {
    path: 'visits/new',
    title: 'Log visit | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/visits/visit-form').then((m) => m.VisitForm),
  },
  {
    path: 'visits/:id/edit',
    title: 'Edit visit | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/visits/visit-form').then((m) => m.VisitForm),
  },
  {
    path: 'retention',
    title: 'Follow-ups | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/retention/retention').then((m) => m.Retention),
  },
  {
    path: 'revenue',
    title: 'Revenue | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/revenue/revenue').then((m) => m.Revenue),
  },
  {
    path: 'analysis',
    title: 'Analysis details | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/analysis/analysis').then((m) => m.Analysis),
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'Overview | Dental Clinic Decision Support',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  { path: '**', redirectTo: '' },
];
