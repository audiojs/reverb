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

/** The values stream() reads at each call, as a host gives a processor its values: each a 1-length array */
export interface DattorroValues {
  decay: ArrayLike<number>
  damping: ArrayLike<number>
  mix: ArrayLike<number>
  /** default 0.9995 */
  bandwidth?: ArrayLike<number>
}

/** The plate's memory for stream(): made once by state(), carried from call to call */
export interface DattorroState { readonly [field: string]: unknown }

/** The plate's memory at `fs` (default 44100): its lines, taps and one-poles */
export function state(fs?: number): DattorroState

/**
 * Streaming form: `n` frames (default `left.length`) of `left`, and of `right` or null for mono, in place, `s` carried
 * from call to call. Calls in order give the samples one whole call gives, bit for bit. `lanes`, when given, holds
 * decay and mix for each of the `n` frames, from 0 and from `M`, in place of `p`'s (a host's ramp of them, sample by
 * sample); damping and bandwidth stay `p`'s.
 */
export function stream(left: Float32Array | Float64Array, right: Float32Array | Float64Array | null, p: DattorroValues, s: DattorroState, n?: number, lanes?: Float64Array, M?: number): void

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings: the tank's slowest
 * mode from a bound on its peak gain, 0.6·(3 + 6·decay)/(1 − decay²), after the input diffusers ring out. Infinity at
 * decay 1, and at damping 1 with a decay above 0.
 */
export function tail(options?: Pick<DattorroOptions, 'decay' | 'damping' | 'fs'>): number
