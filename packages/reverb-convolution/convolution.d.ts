/** Convolution reverb — impulse-response convolution (rooms, plates, cabinets…). */
export interface ConvolutionOptions {
  /** impulse response — required; a missing/empty `ir` throws `RangeError` */
  ir: Float32Array
  /** 0..1, wet/dry blend, default 1 */
  mix?: number
  /** scale the IR to unit energy first, so output level ≈ input level, default false */
  normalize?: boolean
  /** 'auto' (FFT above 1024-sample IRs, direct-form below), 'direct', or 'fft', default 'auto' */
  method?: 'auto' | 'direct' | 'fft'
}

/** Process a mono buffer in place; returns the same array. Wet tail is truncated at the input length. */
export default function convolve(data: Float32Array, options: ConvolutionOptions): Float32Array
