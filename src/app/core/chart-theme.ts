import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { PointStyle } from 'chart.js';
import { SegmentName } from './api.models';

export interface ChartTheme {
  dark: boolean;
  reducedMotion: boolean;
  surface: string;
  text: string;
  muted: string;
  grid: string;
  axis: string;
  segments: Record<SegmentName, string>;
  /** Categorical slots 1-3 for multi-series charts. */
  series: [string, string, string];
  accent: string;
  accentMuted: string;
}

// Categorical slots 1-3, validated all-pairs for colour-vision deficiency in both modes.
const LIGHT: Omit<ChartTheme, 'dark' | 'reducedMotion'> = {
  surface: '#ffffff',
  text: '#102a33',
  muted: '#46606a',
  grid: '#d5e7ed',
  axis: '#6c8a95',
  segments: { Frequent: '#005078', Infrequent: '#b26b00', Inactive: '#c62828' },
  series: ['#2a78d6', '#eb6834', '#1baf7a'],
  // Brand teal-blue for single-series charts.
  accent: '#005078',
  accentMuted: '#9fd2e0',
};

const DARK: Omit<ChartTheme, 'dark' | 'reducedMotion'> = {
  surface: '#0f1f26',
  text: '#e6f0f3',
  muted: '#a6bec5',
  grid: '#1f3a45',
  axis: '#6f919c',
  segments: { Frequent: '#8ccfe3', Infrequent: '#f0b45a', Inactive: '#ff8f85' },
  series: ['#3987e5', '#d95926', '#199e70'],
  accent: '#8ccfe3',
  accentMuted: '#1d4250',
};

/** Shape per segment so identity never depends on colour alone. */
export const SEGMENT_SHAPES: Record<SegmentName, PointStyle> = {
  Frequent: 'circle',
  Infrequent: 'triangle',
  Inactive: 'rectRot',
};

/** Shapes for series 1-3, matching the segment shapes. */
export const SERIES_SHAPES: [PointStyle, PointStyle, PointStyle] = ['circle', 'triangle', 'rectRot'];

export const SEGMENT_SHAPE_NAMES: Record<SegmentName, string> = {
  Frequent: 'circle',
  Infrequent: 'triangle',
  Inactive: 'diamond',
};

/** Tracks the OS colour scheme and reduced-motion setting so charts can redraw. */
@Injectable({ providedIn: 'root' })
export class ChartThemeService {
  private readonly darkQuery = matchMedia('(prefers-color-scheme: dark)');
  private readonly motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly state = signal(this.read());
  readonly theme = this.state.asReadonly();

  constructor() {
    const update = () => this.state.set(this.read());
    this.darkQuery.addEventListener('change', update);
    this.motionQuery.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => {
      this.darkQuery.removeEventListener('change', update);
      this.motionQuery.removeEventListener('change', update);
    });
  }

  private read(): ChartTheme {
    const dark = this.darkQuery.matches;
    return { ...(dark ? DARK : LIGHT), dark, reducedMotion: this.motionQuery.matches };
  }
}
