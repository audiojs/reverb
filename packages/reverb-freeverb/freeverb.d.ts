/** Freeverb — Schroeder-Moorer 8-comb + 4-allpass reverb, Jezar tuning, stereo spread. */
export interface FreeverbOptions {
  /** 0..1, feedback amount (tail length), default 0.5 */
  room?: number
  /** 0..1, high-frequency loss in the comb feedback path, default 0.5 */
  damp?: number
  /** 0..1, wet/dry blend, default 0.33 */
  mix?: number
  /** sample rate in Hz; delay lengths scale to it, default 44100 */
  fs?: number
}

/**
 * Process in place. Mono `Float32Array`, or `[left, right]` for decorrelated stereo spread.
 * Returns the same array (or pair) passed in.
 */
export default function freeverb<T extends Float32Array | Float32Array[]>(data: T, options?: FreeverbOptions): T
