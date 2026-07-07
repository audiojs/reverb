// Convolution reverb — convolve with an impulse response (room, plate, spring, cabinet…).
// Small IRs run direct-form; long IRs run uniform-partitioned FFT overlap-add with a
// frequency-domain delay line (Wefers/Gardner class). Both paths are differential-tested
// against each other. Wet tail truncated at the input length.

import { fft, ifft } from 'fourier-transform'

const PART = 2048            // partition size; FFT size = 2·PART
const DIRECT_MAX = 1024      // direct-form below this IR length

function direct (data, h) {
	let out = new Float64Array(data.length)
	for (let j = 0; j < h.length; j++) {
		let k = h[j]
		if (k === 0) continue
		for (let i = j; i < data.length; i++) out[i] += k * data[i - j]
	}
	return out
}

function partitioned (data, h) {
	let nParts = Math.ceil(h.length / PART)
	let F = 2 * PART
	// IR partition spectra
	let H = []
	let seg = new Float64Array(F)
	for (let p = 0; p < nParts; p++) {
		seg.fill(0)
		for (let i = 0; i < PART; i++) seg[i] = h[p * PART + i] || 0
		let [re, im] = fft(seg)
		H.push([Float64Array.from(re), Float64Array.from(im)])
	}
	// frequency-domain delay line of past input spectra
	let fdl = Array.from({ length: nParts }, () => [new Float64Array(PART + 1), new Float64Array(PART + 1)])
	let fdlPos = 0
	let out = new Float64Array(data.length + F)
	let yRe = new Float64Array(PART + 1), yIm = new Float64Array(PART + 1)
	let block = new Float64Array(F)

	for (let pos = 0; pos < data.length; pos += PART) {
		block.fill(0)
		for (let i = 0; i < PART && pos + i < data.length; i++) block[i] = data[pos + i]
		let [re, im] = fft(block)
		fdl[fdlPos][0].set(re.subarray(0, PART + 1))
		fdl[fdlPos][1].set(im.subarray(0, PART + 1))

		yRe.fill(0); yIm.fill(0)
		for (let p = 0; p < nParts; p++) {
			let [xr, xi] = fdl[(fdlPos - p + nParts) % nParts]
			let [hr, hi] = H[p]
			for (let k = 0; k <= PART; k++) {
				yRe[k] += xr[k] * hr[k] - xi[k] * hi[k]
				yIm[k] += xr[k] * hi[k] + xi[k] * hr[k]
			}
		}
		let y = ifft(yRe, yIm)
		for (let i = 0; i < F && pos + i < out.length; i++) out[pos + i] += y[i]
		fdlPos = (fdlPos + 1) % nParts
	}
	return out.subarray(0, data.length)
}

/**
 * @param {Float32Array} data — mono PCM, processed in place
 * @param {object} opts — { ir: Float32Array, mix=1, normalize=false,
 *   method: 'auto'|'direct'|'fft' }
 *   normalize scales the IR to unit energy so output level ≈ input level
 */
export default function convolve (data, { ir, mix = 1, normalize = false, method = 'auto' } = {}) {
	if (!ir || !ir.length) throw new RangeError('convolve: opts.ir required')
	let h = ir
	if (normalize) {
		let e = 0
		for (let j = 0; j < ir.length; j++) e += ir[j] * ir[j]
		let g = e > 0 ? 1 / Math.sqrt(e) : 1
		h = Float32Array.from(ir, v => v * g)
	}
	let useFft = method === 'fft' || (method === 'auto' && h.length > DIRECT_MAX)
	let wet = useFft ? partitioned(data, h) : direct(data, h)
	for (let i = 0; i < data.length; i++) data[i] = data[i] * (1 - mix) + wet[i] * mix
	return data
}
