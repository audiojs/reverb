// Feedback delay network reverb — N mutually-prime delays with a Householder feedback
// matrix (I − 2/N·11ᵀ, applied in O(N)) and per-line lowpass damping. Jot's FDN topology:
// smooth, colorless late reverb; the modern general-purpose algorithmic reverb.

const DELAYS = [1129, 1291, 1471, 1663, 1811, 1979, 2143, 2311] // mutually prime, @44.1k

/**
 * @param {Float32Array|Float32Array[]} data — mono buffer or [L, R], processed in place
 * @param {object} opts — { decay=0.6 (0..1), damping=0.3 (0..1), mix=0.3, fs=44100 }
 */
export default function fdn (data, { decay = 0.6, damping = 0.3, mix = 0.3, fs = 44100 } = {}) {
	let N = DELAYS.length
	let sc = fs / 44100
	let lines = DELAYS.map(d => ({ buf: new Float64Array(Math.max(1, Math.round(d * sc))), i: 0, lp: 0 }))
	// per-line gain for uniform decay: T60-ish scaling by line length
	let g = lines.map(l => decay * (0.75 + 0.25 * (lines[0].buf.length / l.buf.length)))

	let stereo = data[0]?.length !== undefined
	let L = stereo ? data[0] : data
	let R = stereo ? data[1] : null
	let n = L.length
	let outs = new Float64Array(N)

	for (let i = 0; i < n; i++) {
		let x = stereo ? (L[i] + R[i]) * 0.5 : L[i]

		let sum = 0
		for (let k = 0; k < N; k++) {
			outs[k] = lines[k].buf[lines[k].i]
			sum += outs[k]
		}
		let h = 2 / N * sum // Householder: y_k = x_k − (2/N)·Σx

		let yL = 0, yR = 0
		for (let k = 0; k < N; k++) {
			let line = lines[k]
			let fb = (outs[k] - h) * g[k]
			line.lp = fb * (1 - damping) + line.lp * damping
			line.buf[line.i] = x + line.lp
			if (++line.i >= line.buf.length) line.i = 0
			if (k & 1) yR += outs[k]; else yL += outs[k]
			// alternate signs decorrelate the mono fold-down
			if (k % 4 >= 2) { yL -= outs[k] * 0.5; yR -= outs[k] * 0.5 }
		}
		yL /= N / 2; yR /= N / 2

		if (stereo) {
			L[i] = L[i] * (1 - mix) + yL * mix
			R[i] = R[i] * (1 - mix) + yR * mix
		} else {
			L[i] = L[i] * (1 - mix) + (yL + yR) * 0.5 * mix
		}
	}
	return data
}
