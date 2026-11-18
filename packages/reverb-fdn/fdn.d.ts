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

/** The values stream() reads at each call, as a host gives a processor its values: each a 1-length array */
export interface FdnValues {
  decay: ArrayLike<number>
  damping: ArrayLike<number>
  mix: ArrayLike<number>
  /** seconds; overrides decay when given */
  t60?: ArrayLike<number> | null
}

/** The network's memory for stream(): made once by state(), carried from call to call */
export interface FdnState { readonly [field: string]: unknown }

/** The network's memory at `fs` (default 44100): its lines, damping and decay gains */
export function state(fs?: number): FdnState

/**
 * Streaming form: `n` frames (default `left.length`) of `left`, and of `right` or null for mono, in place, `s` carried
 * from call to call; the decay gains are made anew when the T60 differs from the last call's. Calls in order give the
 * samples one whole call gives, bit for bit. `lanes`, when given, holds decay and mix for each of the `n` frames, from 0
 * and from `M`, in place of `p`'s (a host's ramp of them, sample by sample: the gains are made anew at each frame whose
 * T60 differs); damping stays `p`'s.
 */
export function stream(left: Float32Array | Float64Array, right: Float32Array | Float64Array | null, p: FdnValues, s: FdnState, n?: number, lanes?: Float64Array, M?: number): void

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings: the T60, lengthened
 * by the damping one-pole's delay at DC and by a bound on the network's peak gain, √8/(1 − the largest line gain), plus
 * the longest line played out once. Infinity at damping 1.
 */
export function tail(options?: Pick<FdnOptions, 't60' | 'decay' | 'damping' | 'fs'>): number
