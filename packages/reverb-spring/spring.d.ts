/** Spring reverb — dispersive allpass-chain loop (Parker-Välimäki class simplified model). */
export interface SpringOptions {
  /** 0..1, loop feedback (tail length), default 0.6 */
  decay?: number
  /** 0..1, allpass dispersion coefficient (spring "tightness"), default 0.5 */
  tension?: number
  /** 0..1, high-frequency loss in the loop, default 0.4 */
  damping?: number
  /** 0..1, wet/dry blend, default 0.35 */
  mix?: number
  /** sample rate in Hz; delay lengths scale to it, default 44100 */
  fs?: number
}

/** Process a mono buffer in place; returns the same array. */
export default function spring(data: Float32Array, options?: SpringOptions): Float32Array
