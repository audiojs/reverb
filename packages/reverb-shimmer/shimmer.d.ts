/** Shimmer reverb — octave-up pitch-shifted feedback tail (Valhalla/Eno-Lanois class). */
export interface ShimmerOptions {
  /** 0..1, comb feedback (tail length), default 0.7 */
  decay?: number
  /** 0..1, share of the feedback that returns an octave up (the loop gain stays below 1), default 0.5 */
  shimmer?: number
  /** 0..1, high-frequency loss in the comb feedback path, default 0.3 */
  damping?: number
  /** 0..1, wet/dry blend, default 0.4 */
  mix?: number
  /** sample rate in Hz; delay/ring-buffer lengths scale to it, default 44100 */
  fs?: number
}

/** Process a mono buffer in place; returns the same array. */
export default function shimmer(data: Float32Array, options?: ShimmerOptions): Float32Array

/** The values stream() reads at each call, as a host gives a processor its values: each a 1-length array */
export interface ShimmerValues {
  decay: ArrayLike<number>
  shimmer: ArrayLike<number>
  damping: ArrayLike<number>
  mix: ArrayLike<number>
}

/** One channel's memory for stream(): made once by state(), carried from call to call */
export interface ShimmerState { readonly [field: string]: unknown }

/** One channel's memory at `fs` (default 44100): its combs and the shifter's ring */
export function state(fs?: number): ShimmerState

/**
 * Streaming form: `n` frames (default `data.length`) in place, `s` carried from call to call. Calls in order give the
 * samples one whole call gives, bit for bit. The shifter reads only behind what was written: no latency. `lanes`,
 * when given, holds decay, shimmer and mix for each of the `n` frames, from 0, from `S` and from 2·`S`, in place of
 * `p`'s (a host's ramp of them, sample by sample); damping stays `p`'s.
 */
export function stream(data: Float32Array | Float64Array, p: ShimmerValues, s: ShimmerState, n?: number, lanes?: Float64Array, S?: number): void

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings: the combs' feedback
 * over the longest pass, from the loop's peak gain, 0.7/(1 − feedback), after what the longest comb holds plays out
 * once. Infinity at damping 1 while a share returns through the damping one-pole.
 */
export function tail(options?: Pick<ShimmerOptions, 'decay' | 'shimmer' | 'damping' | 'fs'>): number
