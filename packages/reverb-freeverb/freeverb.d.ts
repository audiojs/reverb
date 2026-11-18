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

/** One channel's memory: made once by channelState(), carried from call to call */
export interface FreeverbState { readonly [field: string]: unknown }

/** One channel's combs and allpasses at `fs`, each `offset` samples longer than Jezar's (0 left, 23 right) */
export function channelState(fs: number, offset: number): FreeverbState

/** One channel in place at a comb feedback (room·0.28 + 0.7), a comb damping (damp·0.4) and a mix, `st` carried */
export function processChannel(data: Float32Array | Float64Array, st: FreeverbState, feedback: number, damp: number, mix: number): void

/** The values stream() reads at each call, as a host gives a processor its values: each a 1-length array */
export interface FreeverbValues {
  room: ArrayLike<number>
  damp: ArrayLike<number>
  mix: ArrayLike<number>
}

/**
 * Streaming form of processChannel: `n` samples (default `data.length`) in place, `st` carried from call to call.
 * `lanes`, when given, holds room and mix for each of the `n` samples, from 0 and from `M`, in place of `p`'s (a host's
 * ramp of them, sample by sample); damp stays `p`'s.
 */
export function stream(data: Float32Array | Float64Array, p: FreeverbValues, st: FreeverbState, n?: number, lanes?: Float64Array, M?: number): void

/**
 * Seconds a stereo pair's output takes to fall 60 dB under the input once the input stops, at these settings: the
 * longest comb's decay from a bound on the network's peak gain, 8·0.015/(1 − feedback)·(5/3)⁴, one more pass of it,
 * then the allpasses' ring.
 */
export function tail(options?: Pick<FreeverbOptions, 'room' | 'damp' | 'fs'>): number
