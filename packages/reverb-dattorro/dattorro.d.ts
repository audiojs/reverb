/** Dattorro plate reverb — input diffusers + figure-eight tank (JAES 1997 topology and taps). */
export interface DattorroOptions {
  /** 0..1, tank feedback (tail length), default 0.5 */
  decay?: number
  /** 0..1, one-pole high-frequency loss in each tank branch, default 0.3 */
  damping?: number
  /** input low-pass coefficient (pre-tank high-cut), default 0.9995 */
  bandwidth?: number
  /** 0..1, wet/dry blend, default 0.3 */
  mix?: number
  /** sample rate in Hz; delay lengths scale to it, default 44100 */
  fs?: number
}

/**
 * Process in place. Mono `Float32Array`, or `[left, right]` for the stereo tank taps.
 * Returns the same array (or pair) passed in.
 */
export default function dattorro<T extends Float32Array | Float32Array[]>(data: T, options?: DattorroOptions): T
