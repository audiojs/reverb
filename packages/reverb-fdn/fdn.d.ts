/** FDN reverb — 8 mutually-prime delays, O(N) Householder feedback, per-line damping (Jot topology). */
export interface FdnOptions {
  /** seconds — decay time to −60 dB; overrides `decay` when set */
  t60?: number
  /** 0..1 convenience knob → t60 = 0.3 + 5·decay², ignored if `t60` is set, default 0.6 */
  decay?: number
  /** 0..1, one-pole high-frequency loss per delay line, default 0.3 */
  damping?: number
  /** 0..1, wet/dry blend, default 0.3 */
  mix?: number
  /** sample rate in Hz; delay lengths scale to it, default 44100 */
  fs?: number
}

/**
 * Process in place. Mono `Float32Array`, or `[left, right]` for decorrelated stereo taps.
 * Returns the same array (or pair) passed in.
 */
export default function fdn<T extends Float32Array | Float32Array[]>(data: T, options?: FdnOptions): T
