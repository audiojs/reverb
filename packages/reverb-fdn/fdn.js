// Feedback delay network reverb — N mutually-prime delays, Householder feedback matrix
// (I − 2/N·11ᵀ, applied in O(N)), per-line lowpass damping, and Jot's per-line decay
// gains g_k = 10^(−3·len_k / (T60·fs)) so every line decays at the same rate → a uniform,
// colorless T60 (Jot & Chaigne 1991). Output taps use orthogonal ± patterns for stereo.

const DELAYS = [1129, 1291, 1471, 1663, 1811, 1979, 2143, 2311] // mutually prime, @44.1k
const SIGN_L = [1, -1, 1, -1, 1, -1, 1, -1]
const SIGN_R = [1, 1, -1, -1, 1, 1, -1, -1]

/**
 * @param {Float32Array|Float32Array[]} data — mono buffer or [L, R], processed in place
 * @param {object} opts — { t60 (seconds; overrides decay), decay=0.6 (0..1 convenience →
 *   t60 = 0.3 + 5·decay²), damping=0.3 (0..1 high-frequency loss), mix=0.3, fs=44100 }
 */
export default function fdn (data, { t60, decay = 0.6, damping = 0.3, mix = 0.3, fs = 44100 } = {}) {
	let N = DELAYS.length
	let sc = fs / 44100
	let T60 = t60 ?? (0.3 + 5 * decay * decay)
	let lines = DELAYS.map(d => {
		let len = Math.max(1, Math.round(d * sc))
		return { buf: new Float64Array(len), i: 0, lp: 0, g: 10 ** (-3 * len / (T60 * fs)) }
	})

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
		let h = 2 / N * sum // Householder reflection: y_k = x_k − (2/N)·Σx

		let yL = 0, yR = 0
		for (let k = 0; k < N; k++) {
			let line = lines[k]
			let fb = (outs[k] - h) * line.g
			line.lp = fb * (1 - damping) + line.lp * damping
			line.buf[line.i] = x + line.lp
			if (++line.i >= line.buf.length) line.i = 0
			yL += SIGN_L[k] * outs[k]
			yR += SIGN_R[k] * outs[k]
		}
		yL /= Math.sqrt(N); yR /= Math.sqrt(N)

		if (stereo) {
			L[i] = L[i] * (1 - mix) + yL * mix
			R[i] = R[i] * (1 - mix) + yR * mix
		} else {
			L[i] = L[i] * (1 - mix) + (yL + yR) * 0.5 * mix
		}
	}
	return data
}
