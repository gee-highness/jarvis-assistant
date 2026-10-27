import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'briefing' },
  { path: 'briefing', loadComponent: () => import('./pages/briefing.page').then(m => m.BriefingPage) },
  { path: 'chat', loadComponent: () => import('./pages/chat.page').then(m => m.ChatPage) },
  { path: 'tasks', loadComponent: () => import('./pages/tasks.page').then(m => m.TasksPage) },
  { path: 'focus', loadComponent: () => import('./pages/focus.page').then(m => m.FocusPage) },
  { path: 'habits', loadComponent: () => import('./pages/habits.page').then(m => m.HabitsPage) },
  { path: 'planner', loadComponent: () => import('./pages/planner.page').then(m => m.PlannerPage) },
  { path: 'review', loadComponent: () => import('./pages/review.page').then(m => m.ReviewPage) },
  { path: 'memory', loadComponent: () => import('./pages/memory.page').then(m => m.MemoryPage) },
  { path: 'voices', loadComponent: () => import('./pages/voices.page').then(m => m.VoicesPage) },
  { path: 'settings', loadComponent: () => import('./pages/settings.page').then(m => m.SettingsPage) },
  { path: '**', redirectTo: 'briefing' },
];
