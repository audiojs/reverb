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

/** The values stream() reads at each call, as a host gives a processor its values: each a 1-length array */
export interface SpringValues {
  decay: ArrayLike<number>
  tension: ArrayLike<number>
  damping: ArrayLike<number>
  mix: ArrayLike<number>
}

/** One channel's memory for stream(): made once by state(), carried from call to call */
export interface SpringState { readonly [field: string]: unknown }

/** One channel's memory at `fs` (default 44100): the allpass chain, the loop and the pre-delay */
export function state(fs?: number): SpringState

/**
 * Streaming form: `n` frames (default `data.length`) in place, `s` carried from call to call. Calls in order give the
 * samples one whole call gives, bit for bit. `lanes`, when given, holds decay and mix for each of the `n` frames, from
 * 0 and from `M`, in place of `p`'s (a host's ramp of them, sample by sample); tension and damping stay `p`'s.
 */
export function stream(data: Float32Array | Float64Array, p: SpringValues, s: SpringState, n?: number, lanes?: Float64Array, M?: number): void

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings: the loop's feedback
 * over its longest delay at any frequency, from the loop's peak gain, 0.6/(1 − feedback), plus the pre-delay. Infinity
 * at damping 1.
 */
export function tail(options?: Pick<SpringOptions, 'decay' | 'tension' | 'damping' | 'fs'>): number
