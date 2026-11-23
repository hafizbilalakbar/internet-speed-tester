import { Component, computed, input } from '@angular/core';

/** Lucide-style stroke icon set (MIT-style geometry), inlined to avoid a runtime icon dependency. */
const PATHS: Record<string, string[]> = {
  gauge: ['M12 14.5 16 9', 'M3.3 19a9 9 0 1 1 17.4 0', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  activity: ['M3 12h4l3-8 4 16 3-8h4'],
  globe: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M3 12h18', 'M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3'],
  server: ['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M7 7h.01', 'M7 17h.01'],
  shield: ['M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6z', 'm9 12 2 2 4-4'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-3v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-3h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 8l2-2 .1.1a1.7 1.7 0 0 0 1.9.3H8.5a1.7 1.7 0 0 0 1-1.6V3h3v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21v3h-.1a1.7 1.7 0 0 0-1.5 1'],
  sun: ['M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5'],
  volume: ['M11 5 6 9H3v6h3l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
  volumeoff: ['M11 5 6 9H3v6h3l5 4z', 'm16 9 5 6', 'm21 9-5 6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  chevron: ['m9 18 6-6-6-6'],
  arrowright: ['M5 12h14', 'm13 6 6 6-6 6'],
  arrowup: ['M7 17 17 7', 'M8 7h9v9'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  share: ['M12 16V3', 'm7 8 5-5 5 5', 'M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7'],
  check: ['m4 12 5 5L20 6'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  wifi: ['M2 8.5a15 15 0 0 1 20 0', 'M5 12a10 10 0 0 1 14 0', 'M8.5 15.5a5 5 0 0 1 7 0', 'M12 19h.01'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'm21 21-4.3-4.3'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7v5l3 2'],
  zap: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5', 'm3 17 9 5 9-5'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  logout: ['M10 4H5v16h5', 'm14 8 4 4-4 4', 'M9 12h9'],
  alert: ['M12 3 2 20h20z', 'M12 9v5', 'M12 17h.01'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 11v6', 'M12 7h.01'],
  pin: ['M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11', 'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5'],
  network: ['M12 3v6', 'M5 21v-5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5', 'M12 14v7', 'M5 21h14'],
  filedown: ['M14 3H6v18h12V7z', 'M14 3v4h4', 'M12 11v5', 'm9.5 14 2.5 2.5L14.5 14'],
  printer: ['M6 9V3h12v6', 'M6 18H4v-7h16v7h-2', 'M6 14h12v7H6z'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  play: ['M8 5v14l11-7z'],
  stop: ['M6 6h12v12H6z'],
  external: ['M14 4h6v6', 'm20 4-9 9', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  mail: ['M3 5h18v14H3z', 'm3 6 9 7 9-7'],
  github: ['M9 20c-5 1.5-5-2.5-7-3', 'M15 21v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.3-1.5 6.3-6.7A5.2 5.2 0 0 0 19.2 4a4.9 4.9 0 0 0-.1-3.6S17.6.2 15 2a12.7 12.7 0 0 0-6 0C6.4.2 4.9.4 4.9.4A4.9 4.9 0 0 0 4.8 4 5.2 5.2 0 0 0 3.6 8c0 5.1 3.3 6.4 6.3 6.7A3.4 3.4 0 0 0 9 17.1V21'],
  database: ['M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  cpu: ['M6 6h12v12H6z', 'M9 9h6v6H9z', 'M9 2v4', 'M15 2v4', 'M9 18v4', 'M15 18v4', 'M2 9h4', 'M2 15h4', 'M18 9h4', 'M18 15h4'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  sliders: ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10', 'M14 4v6', 'M6 14v6'],
  router: ['M4 14h16v6H4z', 'M8 18h.01', 'M12 18h.01', 'M12 10v4', 'M8.5 6.5a5 5 0 0 1 7 0', 'M5.5 3.5a9 9 0 0 1 13 0'],
  sparkles: ['m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  target: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M12 12h.01'],
  bars: ['M4 20v-5', 'M10 20V8', 'M16 20v-9', 'M22 20H2'],
  link: ['M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1'],
  terminal: ['m5 7 5 5-5 5', 'M13 17h6'],
  home: ['m3 11 9-8 9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  help: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M9.5 9a2.5 2.5 0 1 1 4 2c-.9.7-1.5 1.2-1.5 2.5', 'M12 17h.01'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14', 'M10 11v6', 'M14 11v6'],
  plus: ['M12 5v14', 'M5 12h14'],
  edit: ['M4 20h4L20 8l-4-4L4 16z', 'm14 6 4 4'],
  filter: ['M3 5h18l-7 8v6l-4 2v-8z'],
  clockrewind: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 8v4l3 2'],
  routing: ['M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M9 17h4a4 4 0 0 0 4-4V9'],
  phone: ['M7 2h10v20H7z', 'M10 18h4'],
  laptop: ['M5 5h14v10H5z', 'M2 18h20l-1 2H3z'],
  tv: ['M3 5h18v12H3z', 'M8 20h8', 'M12 17v3'],
  tablet: ['M6 2h12v20H6z', 'M11 18h2'],
  device: ['M5 4h14v16H5z', 'M9 20h6'],
};

@Component({
  selector: 'nv-icon',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" [attr.stroke-width]="strokeWidth()" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false">
      @for (d of paths(); track d) { <path [attr.d]="d" /> }
    </svg>`,
  styles: `:host { display: inline-flex; align-items: center; justify-content: center; flex: none; }`,
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input(18);
  readonly strokeWidth = input(1.8);
  readonly paths = computed(() => PATHS[this.name()] ?? PATHS['info']);
}
