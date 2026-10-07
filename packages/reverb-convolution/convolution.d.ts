/** Convolution reverb — impulse-response convolution (rooms, plates, cabinets…). */
export interface ConvolutionOptions {
  /** impulse response — required; a missing/empty `ir` throws `RangeError` */
  ir: Float32Array
  /** 0..1, wet/dry blend, default 1 */
  mix?: number
  /** scale the IR to unit energy first, so output level ≈ input level, default false */
  normalize?: boolean
  /** 'auto' or 'fft' (the partitioned engine, as `convolver`), or 'direct' (the plain direct form), default 'auto' */
  method?: 'auto' | 'direct' | 'fft'
}

/** Process a mono buffer in place; returns the same array. Wet tail is truncated at the input length. */
export default function convolve(data: Float32Array, options: ConvolutionOptions): Float32Array

/** Streaming convolution with no latency: each chunk, of any length, comes back as long as it went in, wet only.
 *  The IR's head [0, 128) direct, the rest by FFT in partitions of 128, 1024 and 8192 (Gardner 1995). */
export function convolver(ir: Float32Array | Float64Array): {
  write(chunk: Float32Array, out?: Float32Array): Float32Array
}
