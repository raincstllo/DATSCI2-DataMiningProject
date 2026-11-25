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
  muted: '#4a5f66',
  grid: '#e4eef2',
  axis: '#76909a',
  segments: { Frequent: '#2a78d6', Infrequent: '#eb6834', Inactive: '#1baf7a' },
  series: ['#2a78d6', '#eb6834', '#1baf7a'],
  // Brand teal-blue for single-series charts.
  accent: '#0b5c73',
  accentMuted: '#9fd2e0',
};

const DARK: Omit<ChartTheme, 'dark' | 'reducedMotion'> = {
  surface: '#122126',
  text: '#e8f1f3',
  muted: '#a9bfc5',
  grid: '#223740',
  axis: '#5f808a',
  segments: { Frequent: '#3987e5', Infrequent: '#d95926', Inactive: '#199e70' },
  series: ['#3987e5', '#d95926', '#199e70'],
  accent: '#5ec4d9',
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
