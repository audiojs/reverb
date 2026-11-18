/**
 * Reverb — Schroeder reverb: parallel feedback comb filters + series allpass.
 * 4 comb filters with LP damping, 2 allpass diffusers.
 */

// 4 prime comb delays (~29–35 ms at 44100 Hz), 2 allpass delays (~6–8 ms at 44100 Hz)
const COMBS = [1277, 1381, 1447, 1523], ALLPASSES = [277, 349]

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings. Each comb returns
 * decay of what it read, so a comb of τ seconds falls by a factor F in τ·log10(F) / −log10(decay): 60 dB, F = 1000,
 * in 3τ / −log10(decay) (Schroeder, "Natural sounding artificial reverberation", JAES 10(3), 1962). τ is the longest
 * comb with its damping one-pole's delay at DC, damping/(1 − damping) samples. A held input builds the ring up to the
 * network's peak gain G times the input, so the ring falls F = 1000·G. G is at DC: a comb's gain is 1/|1 − decay·LP·
 * z^−M|, at most 1/(1 − decay), the one-pole LP's gain being at most 1, at DC; the four average; each stage below
 * (y = z − 0.5·u, z = u + 0.5·z a stage's length back) is ((1 + g²)z^−M − g)/(1 − g·z^−M), whose magnitude grows with
 * cos ω to (1 − g + g²)/(1 − g) = 1.5 at DC. So G = 1.5²/(1 − decay). What the comb holds plays out once more; then
 * the two stages (g = 0.5) ring out: their poles' radius is 0.5^(1/M), so each falls 60 dB in M·ln(1000)/ln(2)
 * samples (J. O. Smith, Introduction to Digital Filters, a pole's decay time). A damping of 1 with a decay above 0
 * never falls (the one-pole holds): Infinity.
 */
export function tail ({ decay = 0.84, damping = 0.5, fs = 44100 } = {}) {
	let scale = fs / 44100, comb = (Math.max(...COMBS) * scale) | 0, aps = ALLPASSES.reduce((t, n) => t + ((n * scale) | 0), 0)
	let loop = decay > 0 ? (comb + damping / (1 - damping)) * Math.log10(1000 * 2.25 / (1 - decay)) / Math.log10(1 / decay) : 0
	return (loop + comb + aps * Math.log(1000) / Math.LN2) / fs
}

/** The reverb's memory at `fs` for stream(): `_c` the combs, `_a` the allpasses, made once */
export function state (fs = 44100) {
	let scale = fs / 44100
	let cl = COMBS.map(n => (n * scale) | 0), al = ALLPASSES.map(n => (n * scale) | 0)
	return {
		_c: { b: cl.map(n => new Float64Array(n)), p: new Int32Array(cl.length), f: new Float64Array(cl.length) },
		_a: { b: al.map(n => new Float64Array(n)), p: new Int32Array(al.length) },
	}
}

/**
 * Streaming form: `n` samples of `data` in place, `s` (state) carried from call to call. `p` holds decay, damping
 * and mix as a host gives a processor its values, each a 1-length array, read at each call. `lanes`, when given, holds
 * decay and mix for each sample, from 0 and from M (a value the comb's feedback and the output scale by, moved sample
 * by sample); damping, a filter's coefficient, stays the call's.
 */
export function stream (data, p, s, n = data.length, lanes = NONE, M = 0) {
	let decay = p.decay[0], damping = p.damping[0], mix = p.mix[0], ramp = lanes.length > 0
	let cb = s._c.b, cp = s._c.p, cf = s._c.f, ab = s._a.b, ap = s._a.p

	for (let i = 0; i < n; i++) {
		if (ramp) { decay = lanes[i]; mix = lanes[M + i] }
		let x = data[i]

		// 4 parallel feedback comb filters with LP damping on feedback path
		let out = 0
		for (let c = 0; c < cb.length; c++) {
			let b = cb[c], y = b[cp[c]]
			cf[c] = y * (1 - damping) + cf[c] * damping   // one-pole LP
			b[cp[c]] = x + decay * cf[c]
			cp[c] = (cp[c] + 1) % b.length
			out += y
		}
		out *= 0.25

		// 2 series Schroeder allpass filters (g = 0.5)
		for (let a = 0; a < ab.length; a++) {
			let b = ab[a], y = b[ap[a]]
			b[ap[a]] = out + 0.5 * y
			ap[a] = (ap[a] + 1) % b.length
			out = y - 0.5 * out
		}

		data[i] = x * (1 - mix) + out * mix
	}
}
const NONE = new Float64Array(0)

export default function reverb (data, params) {
	let decay = params.decay ?? 0.84      // reverb time (0–1)
	let damping = params.damping ?? 0.5   // high-freq damping (0–1)
	let mix = params.mix ?? 0.3           // wet/dry mix
	let fs = params.fs || 44100

	// the state is kept on params: the same object across calls continues one tail
	if (!params._c) Object.assign(params, state(fs))
	stream(data, { decay: [decay], damping: [damping], mix: [mix] }, params)

	return data
}
