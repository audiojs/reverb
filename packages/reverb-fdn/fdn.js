// Feedback delay network reverb — N mutually-prime delays, Householder feedback matrix
// (I − 2/N·11ᵀ, applied in O(N)), per-line lowpass damping, and Jot's per-line decay
// gains g_k = 10^(−3·len_k / (T60·fs)) so every line decays at the same rate → a uniform,
// colorless T60 (Jot & Chaigne 1991). Output taps use orthogonal ± patterns for stereo.

const DELAYS = [1129, 1291, 1471, 1663, 1811, 1979, 2143, 2311] // mutually prime, @44.1k
const SIGN_L = [1, -1, 1, -1, 1, -1, 1, -1]
const SIGN_R = [1, 1, -1, -1, 1, 1, -1, -1]

/** The T60 in seconds the decay knob asks for: 0.3 + 5·decay² */
const t60Of = decay => 0.3 + 5 * decay * decay

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings. Jot's gains make
 * each line fall 60 dB in T60 over passes of its own length; the damping one-pole lengthens every pass by its delay at
 * DC, damping/(1 − damping) samples, which slows the shortest line most; and what the longest line holds plays out
 * once more. A held input builds the ring up to the network's peak gain G times the input, so the ring falls 60 dB and
 * G more: (1 + log10(G)/3) times as long. G: the lines' outputs are V = (I − D·LP·g·H)⁻¹·D·1·x, D the lines' delays
 * (each of magnitude 1), LP the one-pole (at most 1, at DC), g the lines' gains (the shortest line's is the largest,
 * g_max), H the Householder reflection (orthogonal: it keeps a vector's length), 1 the input, fed to all N lines; so
 * ‖V‖ ≤ ‖1‖·|x| / (1 − g_max) = √N·|x| / (1 − g_max), by the geometric series of the loop's norm. Each output sums the
 * lines with signs ±1/√N, a vector of length 1, so it is at most ‖V‖ (Cauchy–Schwarz): G = √N / (1 − g_max). A
 * damping of 1 never falls (the one-pole holds): Infinity.
 */
export function tail ({ t60, decay = 0.6, damping = 0.3, fs = 44100 } = {}) {
	let T60 = t60 ?? t60Of(decay), sc = fs / 44100
	let shortest = Math.max(1, Math.round(DELAYS[0] * sc)), longest = Math.max(1, Math.round(DELAYS[DELAYS.length - 1] * sc))
	let G = Math.sqrt(DELAYS.length) / (1 - 10 ** (-3 * shortest / (T60 * fs)))
	return (T60 > 0 ? T60 * (shortest + damping / (1 - damping)) / shortest * (1 + Math.log10(G) / 3) : 0) + longest / fs
}

/** The network's memory at `fs` for stream(): the lines, their damping and decay gains, made once */
export function state (fs = 44100) {
	let N = DELAYS.length, sc = fs / 44100
	let len = Int32Array.from(DELAYS, d => Math.max(1, Math.round(d * sc)))
	return {
		fs, len, buf: Array.from(len, l => new Float64Array(l)), i: new Int32Array(N), lp: new Float64Array(N),
		g: new Float64Array(N), outs: new Float64Array(N),
		t60: new Float64Array([NaN]),   // the T60 the gains were made for
	}
}

/**
 * Streaming form: `n` frames of `L` (and `R`, or null for mono) in place, the network `s` carried from call to call.
 * `p` holds decay (or t60, seconds, which overrides it), damping and mix as a host gives a processor its values, each
 * a 1-length array, read at each call; the decay gains are made anew when the T60 differs from the last call's.
 * `lanes`, when given, holds decay and mix for each sample, from 0 and from M (the lines' gains and the output scale
 * the signal, so they move sample by sample: the gains are made anew at each sample whose T60 differs); damping, a
 * filter's coefficient, stays the call's.
 */
export function stream (L, R, p, s, n = L.length, lanes = NONE, M = 0) {
	let N = DELAYS.length, damping = p.damping[0], mix = p.mix[0], ramp = lanes.length > 0, byDecay = !p.t60
	let T60 = p.t60 ? p.t60[0] : t60Of(p.decay[0])
	let len = s.len, buf = s.buf, idx = s.i, lp = s.lp, g = s.g, outs = s.outs
	if (T60 !== s.t60[0]) {
		for (let k = 0; k < N; k++) g[k] = 10 ** (-3 * len[k] / (T60 * s.fs))
		s.t60[0] = T60
	}

	for (let i = 0; i < n; i++) {
		if (ramp) {
			mix = lanes[M + i]
			// t60Of written out: a number handed to a call the engine leaves out is a new object, each sample
			let d = lanes[i]
			if (byDecay && (T60 = 0.3 + 5 * d * d) !== s.t60[0]) {
				for (let k = 0; k < N; k++) g[k] = 10 ** (-3 * len[k] / (T60 * s.fs))
				s.t60[0] = T60
			}
		}
		let x = R ? (L[i] + R[i]) * 0.5 : L[i]

		let sum = 0
		for (let k = 0; k < N; k++) {
			outs[k] = buf[k][idx[k]]
			sum += outs[k]
		}
		let h = 2 / N * sum // Householder reflection: y_k = x_k − (2/N)·Σx

		let yL = 0, yR = 0
		for (let k = 0; k < N; k++) {
			let fb = (outs[k] - h) * g[k]
			lp[k] = fb * (1 - damping) + lp[k] * damping
			buf[k][idx[k]] = x + lp[k]
			if (++idx[k] >= len[k]) idx[k] = 0
			yL += SIGN_L[k] * outs[k]
			yR += SIGN_R[k] * outs[k]
		}
		yL /= Math.sqrt(N); yR /= Math.sqrt(N)

		if (R) {
			L[i] = L[i] * (1 - mix) + yL * mix
			R[i] = R[i] * (1 - mix) + yR * mix
		} else {
			L[i] = L[i] * (1 - mix) + (yL + yR) * 0.5 * mix
		}
	}
}
const NONE = new Float64Array(0)

/**
 * @param {Float32Array|Float32Array[]} data — mono buffer or [L, R], processed in place
 * @param {object} opts — { t60 (seconds; overrides decay), decay=0.6 (0..1 convenience →
 *   t60 = 0.3 + 5·decay²), damping=0.3 (0..1 high-frequency loss), mix=0.3, fs=44100 }
 */
export default function fdn (data, { t60, decay = 0.6, damping = 0.3, mix = 0.3, fs = 44100 } = {}) {
	let stereo = data[0]?.length !== undefined
	stream(stereo ? data[0] : data, stereo ? data[1] : null, { t60: t60 == null ? null : [t60], decay: [decay], damping: [damping], mix: [mix] }, state(fs))
	return data
}
