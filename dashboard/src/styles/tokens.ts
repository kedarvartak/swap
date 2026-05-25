export const colors = {
  bg:           '#0a0a0a',
  bgPanel:      '#0d0d0d',
  bgRow:        '#111111',
  bgRowHover:   '#161616',

  green:        '#00ff41',
  greenDim:     '#00aa2a',
  greenFaint:   '#003310',

  amber:        '#ffb000',
  amberDim:     '#996800',

  red:          '#ff0040',
  redDim:       '#990026',

  cyan:         '#00e5ff',
  cyanDim:      '#008899',

  white:        '#e0e0e0',
  gray:         '#555555',
  grayDim:      '#333333',

  border:       '#1a1a1a',
  borderBright: '#2a2a2a',
} as const;

export const fonts = {
  mono: "'JetBrains Mono', monospace",
} as const;

export const sizes = {
  xs:  '10px',
  sm:  '11px',
  md:  '12px',
  lg:  '13px',
  xl:  '14px',
  xxl: '16px',
} as const;

export const spacing = {
  xs:  2,
  sm:  4,
  md:  8,
  lg:  12,
  xl:  16,
  xxl: 24,
} as const;
