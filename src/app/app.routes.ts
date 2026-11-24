import { Routes } from '@angular/router';
import { HomePage } from './features/home/home.page';

/** Only real, maintained destinations. No SEO filler or stub pages. */
export const routes: Routes = [
  // The landing test is eager so its layout is present on first paint (no route-chunk shift).
  { path: '', title: 'Internet Speed Test', component: HomePage },
  { path: 'speed-test', title: 'Internet Speed Test', component: HomePage },
  { path: 'history', title: 'Results & History', loadComponent: () => import('./features/history/history.page').then(m => m.HistoryPage) },
  { path: 'result/:token', title: 'Test Result', loadComponent: () => import('./features/results/results.page').then(m => m.ResultsPage) },
  { path: 'r/:id', title: 'Test Result', loadComponent: () => import('./features/results/results.page').then(m => m.ResultsPage) },
  { path: 'tools', title: 'Network Tools', loadComponent: () => import('./features/tools/tools.page').then(m => m.ToolsPage) },
  { path: 'servers', title: 'Test Servers', loadComponent: () => import('./features/servers/servers.page').then(m => m.ServersPage) },
  { path: 'guides', title: 'Internet Guides', loadComponent: () => import('./features/guides/guides.page').then(m => m.GuidesPage) },
  { path: 'about', title: 'About Netvelox', data: { page: 'about' }, loadComponent: () => import('./features/legal/legal.page').then(m => m.LegalPage) },
  { path: 'privacy', title: 'Privacy Policy', loadComponent: () => import('./features/guides/privacy.page').then(m => m.PrivacyPage) },
  { path: 'terms', title: 'Terms of Service', data: { page: 'terms' }, loadComponent: () => import('./features/legal/legal.page').then(m => m.LegalPage) },
  { path: '**', title: 'Page Not Found', loadComponent: () => import('./features/not-found/not-found.page').then(m => m.NotFoundPage) },
];
