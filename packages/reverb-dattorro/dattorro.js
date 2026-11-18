// Dattorro plate reverb — input diffusion (4 allpasses) into a figure-eight tank of two
// cross-coupled branches (allpass → delay → damping → decay → allpass → delay).
// Modulation omitted (static tank). Structure, delay lengths and output taps from Dattorro, "Effect Design Part 1:
// Reverberator and Other Filters", JAES 45(9), 1997 (reference rate 29761 Hz, scaled to fs).

const REF = 29761
// the delay lines, in one memory: the four input allpasses, then each tank branch's allpass, delay, allpass, delay
// (branch 1 from line 4, branch 2 from line 8)
const LINES = [142, 107, 379, 277, 672, 4453, 1800, 3720, 908, 4217, 2656, 3163]
const GAIN = [0.75, 0.75, 0.625, 0.625, 0.7, 0, 0.5, 0, 0.7, 0, 0.5, 0]   // each allpass's coefficient
// output taps (Dattorro Table 2), yL's seven then yR's: the line each reads, how far back, with which sign
const TAP_LINE = [9, 9, 10, 11, 5, 6, 7, 5, 5, 6, 7, 9, 10, 11]
const TAPS = [266, 2974, 1913, 1996, 1990, 187, 1066, 353, 3627, 1228, 2673, 2111, 335, 121]
const TAP_SIGN = [1, 1, -1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1]

// What the tail is made of, in samples at REF: an allpass of M samples and coefficient g has its poles at radius
// g^(1/M), so falls 60 dB in M·ln(1000)/−ln(g) (J. O. Smith, Introduction to Digital Filters, a pole's decay time);
// its group delay peaks at M·(1 + g)/(1 − g)
const ring = (M, g) => M * Math.log(1000) / -Math.log(g)
let DIFFUSE = 0, LOOP = 0, SLOWEST = 0
for (let k = 0; k < LINES.length; k++) {
	let M = LINES[k], g = GAIN[k]
	if (k < 4) DIFFUSE += ring(M, g)
	else if (g) LOOP += M * (1 + g) / (1 - g), SLOWEST = Math.max(SLOWEST, ring(M, g))
	else LOOP += M
}

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings. The tank is one
 * loop through which decay is applied four times, so a round of τ seconds has gain decay⁴ and the loop falls by a
 * factor F in τ·log10(F) / −log10(decay⁴): 60 dB, F = 1000, in 3τ / −log10(decay⁴) (Schroeder, "Natural sounding
 * artificial reverberation", JAES 10(3), 1962). τ is the loop's longest delay at any frequency, so no mode is slower:
 * each allpass at its group delay's peak, each damping one-pole at its delay at DC, damping/(1 − damping) samples. A
 * held input builds the ring up to the tank's peak gain G times the input, so the ring falls F = 1000·G. G, with every
 * allpass and line of gain 1 and the one-poles at most 1: a branch is at most decay (applied once in it), so the
 * branches' inputs, in1 = v + decay·B2·in2 and in2 = v + decay·B1·in1, are at most |v|·(1 + decay²)/(1 − decay⁴) =
 * |v|/(1 − decay²); the taps read seven lines a side, 0.6 times each: one branch's first delay twice and the other's
 * once (each at most |in|), each branch's second delay (decay·|in|) and the inside of each branch's second allpass
 * (1/|1 + 0.5·z^−M| ≤ 2 times decay·|in|), so G = 0.6·(3 + 6·decay)/(1 − decay²). Before the tank the input diffusers ring out; as decay goes to 0
 * the slowest tank allpass's own ring is what remains. A decay of 1 never falls, nor does a damping of 1 with a decay
 * above 0 (the one-pole holds what it had): Infinity.
 */
export function tail ({ decay = 0.5, damping = 0.3, fs = 44100 } = {}) {
	let tau = LOOP / REF + 2 * damping / (1 - damping) / fs, G = 0.6 * (3 + 6 * decay) / (1 - decay * decay)
	let loop = decay >= 1 ? Infinity : decay > 0 ? tau * Math.log10(1000 * G) / (4 * Math.log10(1 / decay)) : 0
	return DIFFUSE / REF + Math.max(loop, SLOWEST / REF)
}

/** The plate's memory at `fs` for stream(): its lines, taps and one-poles, made once */
export function state (fs = 44100) {
	let sc = fs / REF
	let S = n => Math.max(1, Math.round(n * sc))
	let len = Int32Array.from(LINES, S), o = new Int32Array(len.length)
	for (let k = 1; k < len.length; k++) o[k] = o[k - 1] + len[k - 1]
	return {
		m: new Float64Array(o[len.length - 1] + len[len.length - 1]), o, len, pos: new Int32Array(len.length),
		taps: Int32Array.from(TAPS, S),
		lp: new Float64Array(3),   // the input low-pass, branch 1's and branch 2's damping
	}
}

/**
 * Streaming form: `n` frames of `L` (and `R`, or null for mono) in place, the plate `s` carried from call to call.
 * `p` holds decay, damping, mix (and bandwidth, else 0.9995) as a host gives a processor its values, each a 1-length
 * array, read at each call. `lanes`, when given, holds decay and mix for each sample, from 0 and from M (values the
 * tank and the output scale by, moved sample by sample); damping and bandwidth, filters' coefficients, stay the call's.
 */
export function stream (L, R, p, s, n = L.length, lanes = NONE, M = 0) {
	let decay = p.decay[0], damping = p.damping[0], mix = p.mix[0], bandwidth = p.bandwidth ? p.bandwidth[0] : 0.9995, ramp = lanes.length > 0
	let m = s.m, o = s.o, len = s.len, pos = s.pos, t = s.taps, lp = s.lp, lpIn = lp[0]
	// a line's write position w and the one after it, j: where its oldest sample is (read(N − 1)), and where w goes
	let N, w, j, z, y, v

	for (let i = 0; i < n; i++) {
		if (ramp) { decay = lanes[i]; mix = lanes[M + i] }
		let dry = R ? (L[i] + R[i]) * 0.5 : L[i]

		lpIn = dry * bandwidth + lpIn * (1 - bandwidth)
		v = lpIn
		for (let k = 0; k < 4; k++) {
			N = len[k]; w = pos[k]; j = w + 1 < N ? w + 1 : 0
			z = m[o[k] + j]; y = v + z * -GAIN[k]
			m[o[k] + w] = y; pos[k] = j
			v = z + y * GAIN[k]
		}

		// figure-eight: each branch is fed by the other branch's end
		let in1 = v + m[o[11] + (pos[11] + 1 < len[11] ? pos[11] + 1 : 0)] * decay
		let in2 = v + m[o[7] + (pos[7] + 1 < len[7] ? pos[7] + 1 : 0)] * decay

		for (let b = 4; b < 12; b += 4) {
			v = b === 4 ? in1 : in2
			// allpass
			N = len[b]; w = pos[b]; j = w + 1 < N ? w + 1 : 0
			z = m[o[b] + j]; y = v + z * -GAIN[b]
			m[o[b] + w] = y; pos[b] = j
			v = z + y * GAIN[b]
			// delay, its oldest sample through the damping one-pole, then decay
			N = len[b + 1]; w = pos[b + 1]; j = w + 1 < N ? w + 1 : 0
			m[o[b + 1] + w] = v; pos[b + 1] = j
			lp[b >> 2] = m[o[b + 1] + (j + 1 < N ? j + 1 : 0)] * (1 - damping) + lp[b >> 2] * damping
			v = lp[b >> 2] * decay
			// allpass
			N = len[b + 2]; w = pos[b + 2]; j = w + 1 < N ? w + 1 : 0
			z = m[o[b + 2] + j]; y = v + z * -GAIN[b + 2]
			m[o[b + 2] + w] = y; pos[b + 2] = j
			v = z + y * GAIN[b + 2]
			// delay
			N = len[b + 3]; w = pos[b + 3]; j = w + 1 < N ? w + 1 : 0
			m[o[b + 3] + w] = v; pos[b + 3] = j
		}

		// output taps (Dattorro Table 2), scaled, summed in the table's order
		let yL = 0, yR = 0
		for (let k = 0; k < TAPS.length; k++) {
			let q = TAP_LINE[k], d = (pos[q] - t[k]) % len[q]
			v = m[o[q] + (d < 0 ? d + len[q] : d)]
			if (k < 7) yL = k === 0 ? v : yL + TAP_SIGN[k] * v
			else yR = k === 7 ? v : yR + TAP_SIGN[k] * v
		}
		yL = 0.6 * yL; yR = 0.6 * yR

		if (R) {
			L[i] = L[i] * (1 - mix) + yL * mix
			R[i] = R[i] * (1 - mix) + yR * mix
		} else {
			L[i] = L[i] * (1 - mix) + (yL + yR) * 0.5 * mix
		}
	}
	lp[0] = lpIn
}
const NONE = new Float64Array(0)

/**
 * @param {Float32Array|Float32Array[]} data — mono buffer or [L, R], processed in place
 * @param {object} opts — { decay=0.5 (0..1), damping=0.3 (0..1), bandwidth=0.9995,
 *   mix=0.3, fs=44100 }
 */
export default function dattorro (data, { decay = 0.5, damping = 0.3, bandwidth = 0.9995, mix = 0.3, fs = 44100 } = {}) {
	let stereo = data[0]?.length !== undefined
	stream(stereo ? data[0] : data, stereo ? data[1] : null, { decay: [decay], damping: [damping], bandwidth: [bandwidth], mix: [mix] }, state(fs))
	return data
}
