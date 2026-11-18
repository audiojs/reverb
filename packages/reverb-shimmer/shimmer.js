// Shimmer reverb — a reverb core whose feedback path is pitch-shifted up an octave,
// so the tail climbs into sparkling upper octaves (Valhalla Shimmer / Eno-Lanois class).
// The in-loop shifter is a 2-tap delay-line shifter (×2 playback, crossfaded grains):
// loop-friendly; offline high-quality shifting lives in @audio/shift-*.

const COMBS = [1557, 1617, 1491, 1422]

/** The shifter's window in samples at `fs`: its taps read from 0 to this many samples back */
const windowOf = fs => Math.max(64, Math.round(2048 * (fs / 44100)))

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings. Each comb returns
 * fb = 0.5 + 0.45·decay of what it read, so a loop of τ seconds falls by a factor F in τ·log10(F) / −log10(fb): 60 dB,
 * F = 1000, in 3τ / −log10(fb) (Schroeder, "Natural sounding artificial reverberation", JAES 10(3), 1962). τ is the
 * longest pass: the longest comb, and on top of it, for the share that returns as it was, the damping one-pole's
 * delay at DC, damping/(1 − damping) samples, or, for the share that returns an octave up, the shifter's window, the
 * farthest its taps read back. A held input builds the ring up to the loop's peak gain G times the input, so the ring
 * falls F = 1000·G. The shifter moves frequencies, so G is a bound on the largest sample: each comb takes 0.7 of the
 * input and fb of a blend of its one-pole (a weighted average of its past, weights summing to 1) and the shifter
 * (two interpolated reads of the combs' mean, their gains summing to 1), so no comb exceeds 0.7·A + fb times the
 * largest of them: G = 0.7/(1 − fb), reached by DC. The output reads the combs' ends, so what the longest comb holds
 * plays out once more before it falls. A damping of 1 never falls while a share returns through it (the one-pole
 * holds what it had): Infinity.
 */
export function tail ({ decay = 0.7, shimmer = 0.5, damping = 0.3, fs = 44100 } = {}) {
	let fb = 0.5 + 0.45 * decay, longest = Math.max(1, Math.round(Math.max(...COMBS) * (fs / 44100)))
	let tau = (longest + Math.max(shimmer < 1 ? damping / (1 - damping) : 0, shimmer > 0 ? windowOf(fs) : 0)) / fs
	return tau * Math.log10(1000 * 0.7 / (1 - fb)) / Math.log10(1 / fb) + longest / fs
}

/** One channel's memory at `fs` for stream(): the combs and the shifter's ring, made once */
export function state (fs = 44100) {
	let sc = fs / 44100, W = windowOf(fs)
	let len = Int32Array.from(COMBS, d => Math.max(1, Math.round(d * sc)))
	return {
		len, buf: Array.from(len, l => new Float64Array(l)), i: new Int32Array(COMBS.length), lp: new Float64Array(COMBS.length),
		W, ring: new Float64Array(W + 2), w: new Int32Array(1), ph: new Float64Array(1),
	}
}

// the ring read `d` samples behind the write head `w`, linearly interpolated
function tap (ring, N, w, d) {
	let p = w - d; if (p < 0) p += N
	let i0 = p | 0, frac = p - i0
	return ring[i0] * (1 - frac) + ring[(i0 + 1) % N] * frac
}

/**
 * Streaming form: `n` frames of `data` in place, `s` carried from call to call. `p` holds decay, shimmer, damping and
 * mix as a host gives a processor its values, each a 1-length array, read at each call. `lanes`, when given, holds
 * decay, shimmer and mix for each sample, from 0, from S and from 2·S (values the feedback, its octave share and the
 * output scale by, moved sample by sample); damping, a filter's coefficient, stays the call's.
 */
export function stream (data, p, s, n = data.length, lanes = NONE, S = 0) {
	let fb = 0.5 + 0.45 * p.decay[0], shimmer = p.shimmer[0], damping = p.damping[0], mix = p.mix[0], ramp = lanes.length > 0
	let M = COMBS.length, len = s.len, buf = s.buf, ci = s.i, lp = s.lp

	// octave-up delay-line shifter: two taps half a window apart whose delays fall one
	// sample per sample (×2 playback); each fades out where its delay jumps back to W
	let W = s.W, N = W + 2, ring = s.ring
	let w = s.w[0], ph = s.ph[0]

	for (let i = 0; i < n; i++) {
		if (ramp) { fb = 0.5 + 0.45 * lanes[i]; shimmer = lanes[S + i]; mix = lanes[2 * S + i] }
		// previous wet sum
		let wet = 0
		for (let k = 0; k < M; k++) wet += buf[k][ci[k]]
		wet /= M

		// octave-up copy of the wet signal: triangular gains sum to 1 and are 0 at each jump
		ring[w] = wet
		let g = 1 - Math.abs(2 * ph - 1)
		let up = tap(ring, N, w, W * (1 - ph)) * g + tap(ring, N, w, W * (1 - (ph < 0.5 ? ph + 0.5 : ph - 0.5))) * (1 - g)
		if ((ph += 1 / W) >= 1) ph -= 1
		w = (w + 1) % N

		// `shimmer` is the share of the feedback that returns an octave up, so the loop gain
		// stays fb < 1 (added on top of fb, the loop gained up to 1.8 and grew without bound)
		let inject = data[i] * 0.7
		for (let k = 0; k < M; k++) {
			let y = buf[k][ci[k]]
			lp[k] = y * (1 - damping) + lp[k] * damping
			buf[k][ci[k]] = inject + fb * (lp[k] * (1 - shimmer) + up * shimmer)
			if (++ci[k] >= len[k]) ci[k] = 0
		}

		data[i] = data[i] * (1 - mix) + wet * mix
	}
	s.w[0] = w; s.ph[0] = ph
}
const NONE = new Float64Array(0)

/**
 * @param {Float32Array} data — mono PCM, processed in place
 * @param {object} opts — { decay=0.7 (0..1), shimmer=0.5 (0..1 share of the feedback returned an octave up),
 *   damping=0.3, mix=0.4, fs=44100 }
 */
export default function shimmer (data, { decay = 0.7, shimmer = 0.5, damping = 0.3, mix = 0.4, fs = 44100 } = {}) {
	stream(data, { decay: [decay], shimmer: [shimmer], damping: [damping], mix: [mix] }, state(fs))
	return data
}
