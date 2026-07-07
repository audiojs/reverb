// Convolution reverb — convolve with an impulse response (room, plate, spring, cabinet…).
// Direct-form convolution, wet tail truncated at the input length; partitioned FFT
// convolution is the planned streaming/long-IR optimization.

/**
 * @param {Float32Array} data — mono PCM, processed in place
 * @param {object} opts — { ir: Float32Array, mix=1, normalize=false }
 *   normalize scales the IR to unit energy so output level ≈ input level
 */
export default function convolve (data, { ir, mix = 1, normalize = false } = {}) {
	if (!ir || !ir.length) throw new RangeError('convolve: opts.ir required')
	let h = ir
	if (normalize) {
		let e = 0
		for (let j = 0; j < ir.length; j++) e += ir[j] * ir[j]
		let g = e > 0 ? 1 / Math.sqrt(e) : 1
		h = Float32Array.from(ir, v => v * g)
	}
	let out = new Float64Array(data.length)
	for (let j = 0; j < h.length; j++) {
		let k = h[j]
		if (k === 0) continue
		for (let i = j; i < data.length; i++) out[i] += k * data[i - j]
	}
	for (let i = 0; i < data.length; i++) data[i] = data[i] * (1 - mix) + out[i] * mix
	return data
}
