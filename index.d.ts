// @audio/reverb — reverberation umbrella re-exporting every @audio/reverb-* atom.
// For smaller bundles, depend directly on the individual atom.

export { default as schroeder } from '@audio/reverb-schroeder'
export { default as freeverb } from '@audio/reverb-freeverb'
export { default as dattorro } from '@audio/reverb-dattorro'
export { default as convolve } from '@audio/reverb-convolution'
export { default as fdn } from '@audio/reverb-fdn'
export { default as spring } from '@audio/reverb-spring'
export { default as shimmer } from '@audio/reverb-shimmer'
export type { ConvolutionOptions } from '@audio/reverb-convolution'
export type { DattorroOptions } from '@audio/reverb-dattorro'
export type { FdnOptions } from '@audio/reverb-fdn'
export type { FreeverbOptions } from '@audio/reverb-freeverb'
export type { SchroederOptions } from '@audio/reverb-schroeder'
export type { ShimmerOptions } from '@audio/reverb-shimmer'
export type { SpringOptions } from '@audio/reverb-spring'
