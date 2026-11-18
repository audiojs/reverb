/** Schroeder reverb — 4 parallel feedback combs with LP damping + 2 series allpass diffusers. */
export interface SchroederOptions {
  /** 0..1, comb feedback (reverb time), default 0.84 */
  decay?: number
  /** 0..1, high-frequency loss in the comb feedback path, default 0.5 */
  damping?: number
  /** 0..1, wet/dry blend, default 0.3 */
  mix?: number
  /** sample rate in Hz; delay lengths scale to it, default 44100 */
  fs?: number
}

/**
 * Process a mono buffer in place; returns the same array.
 *
 * `options` is required — unlike the rest of this family there is no default `= {}`,
 * so `schroeder(data)` throws reading params off `undefined`. Pass at least `{}`.
 *
 * State (comb/allpass buffers) is cached on the `options` object itself (`_c`/`_a`
 * properties, added on first use). Reuse the same object across calls to continue one
 * reverb tail across chunks; pass a fresh object per buffer for independent reverbs.
 */
export default function schroeder(data: Float32Array, options: SchroederOptions): Float32Array

/** The values stream() reads at each call, as a host gives a processor its values: each a 1-length array */
export interface SchroederValues {
  decay: ArrayLike<number>
  damping: ArrayLike<number>
  mix: ArrayLike<number>
}

/** The reverb's memory for stream(): made once by state(), carried from call to call */
export interface SchroederState { readonly _c: unknown, readonly _a: unknown }

/** The reverb's memory at `fs` (default 44100): `_c` the combs, `_a` the allpasses */
export function state(fs?: number): SchroederState

/**
 * Streaming form without an options object: `n` samples (default `data.length`) in place, `s` carried from call to
 * call. `lanes`, when given, holds decay and mix for each of the `n` samples, from 0 and from `M`, in place of `p`'s
 * (a host's ramp of them, sample by sample); damping stays `p`'s.
 */
export function stream(data: Float32Array | Float64Array, p: SchroederValues, s: SchroederState, n?: number, lanes?: Float64Array, M?: number): void

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings: the longest comb's
 * decay from the network's peak gain, 1.5²/(1 − decay) at DC, one more pass of it, then the allpasses' ring. Infinity
 * at damping 1 with a decay above 0.
 */
export function tail(options?: Pick<SchroederOptions, 'decay' | 'damping' | 'fs'>): number
