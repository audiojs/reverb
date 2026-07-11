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
