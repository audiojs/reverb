/** Shimmer reverb — octave-up pitch-shifted feedback tail (Valhalla/Eno-Lanois class). */
export interface ShimmerOptions {
  /** 0..1, comb feedback (tail length), default 0.7 */
  decay?: number
  /** 0..1, amount of octave-up signal re-injected into the feedback path, default 0.5 */
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
