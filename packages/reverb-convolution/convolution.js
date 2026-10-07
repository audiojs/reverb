// Convolution reverb — convolve with an impulse response (room, plate, spring, cabinet…).
// One engine, streaming with no latency (below); `method: 'direct'` runs the plain direct form,
// its reference in the tests. Wet tail truncated at the input length.

import { fft, ifft } from 'fourier-transform'

function direct (data, h) {
	let out = new Float64Array(data.length)
	for (let j = 0; j < h.length; j++) {
		let k = h[j]
		if (k === 0) continue
		for (let i = j; i < data.length; i++) out[i] += k * data[i - j]
	}
	return out
}

// Streaming, with no latency: each output sample leaves with its input sample, in chunks of any length. The IR
// splits by offset (Gardner 1995, "Efficient convolution without input-output delay", JAES 43(3)): its head
// [0, 128) convolved directly, the rest by FFT overlap-save with a frequency-domain delay line in uniform
// partitions growing with the offset, 128 to 1024, 1024 to 8192, 8192 on. A level of partition B starts at offset
// B: a block's output through it is due only once the block is in, so its FFT runs at the block's end and its B
// samples wait in an output ring.
const HEAD = 128, LEVELS = [[128, 1024], [1024, 8192], [8192, Infinity]]   // [partition, up to]

function level (h, B, from, to) {
	let n = Math.ceil((Math.min(h.length, to) - from) / B), seg = new Float64Array(2 * B), H = []
	for (let p = 0; p < n; p++) {
		seg.fill(0)
		for (let i = 0, o = from + p * B, e = Math.min(B, to - o, h.length - o); i < e; i++) seg[i] = h[o + i]
		let [re, im] = fft(seg)
		H.push([Float64Array.from(re), Float64Array.from(im)])
	}
	let fdl = Array.from({ length: n }, () => [new Float64Array(B + 1), new Float64Array(B + 1)])
	return { B, n, H, fdl, at: 0, frame: new Float64Array(2 * B), yRe: new Float64Array(B + 1), yIm: new Float64Array(B + 1), y: new Float64Array(2 * B) }
}

/**
 * @param {Float32Array|Float64Array} ir — impulse response
 * @returns {{ write(chunk: Float32Array, out?: Float32Array): Float32Array }} — wet only, as long as the chunk
 */
export function convolver (ir) {
	if (!ir || !ir.length) throw new RangeError('convolver: an impulse response is required')
	let h = Float64Array.from(ir), N = h.length
	let head = h.subarray(0, Math.min(N, HEAD)), hn = head.length
	let levels = [], from = HEAD
	for (let [B, to] of LEVELS) if (N > from) { levels.push(level(h, B, from, to)); from = to }
	let BMAX = levels.length ? levels.at(-1).B : HEAD
	// the input's last X samples twice over (xs[j + X] is xs[j]: any 2·BMAX of them contiguous), and what the
	// levels have made of it for the next BMAX
	let X = 2 * BMAX, xs = new Float64Array(2 * X), ring = new Float64Array(BMAX), t = 0

	function run (L) {
		let { B, n, H, fdl, frame, yRe, yIm, y } = L
		frame.set(xs.subarray(t % X + X - 2 * B, t % X + X))
		fft(frame, fdl[L.at])
		yRe.fill(0); yIm.fill(0)
		for (let p = 0; p < n; p++) {
			let [xr, xi] = fdl[(L.at - p + n) % n], [hr, hi] = H[p]
			for (let k = 0; k <= B; k++) {
				yRe[k] += xr[k] * hr[k] - xi[k] * hi[k]
				yIm[k] += xr[k] * hi[k] + xi[k] * hr[k]
			}
		}
		L.at = (L.at + 1) % n
		ifft(yRe, yIm, y)
		// overlap-save: the frame's second half is the output for [t, t + B)
		for (let i = 0, r = t % BMAX; i < B; i++) ring[r + i] += y[B + i]
	}

	return {
		write (chunk, out = new Float32Array(chunk.length)) {
			for (let i = 0, len = chunk.length; i < len;) {
				// up to the next boundary of the smallest partition, where a level may run
				let e = Math.min(len, i + HEAD - t % HEAD)
				for (; i < e; i++, t++) {
					let j = t % X + X, r = t % BMAX, acc = ring[r]
					xs[j] = xs[j - X] = chunk[i]
					ring[r] = 0
					for (let k = 0; k < hn; k++) acc += head[k] * xs[j - k]
					out[i] = acc
				}
				for (let L of levels) if (t % L.B === 0) run(L)
			}
			return out
		}
	}
}

/**
 * @param {Float32Array} data — mono PCM, processed in place
 * @param {object} opts — { ir: Float32Array, mix=1, normalize=false,
 *   method: 'auto'|'direct'|'fft' ('auto' and 'fft': the partitioned engine) }
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
	let wet = method === 'direct' ? direct(data, h) : convolver(h).write(data)
	for (let i = 0; i < data.length; i++) data[i] = data[i] * (1 - mix) + wet[i] * mix
	return data
}
