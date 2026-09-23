// Shimmer reverb — a reverb core whose feedback path is pitch-shifted up an octave,
// so the tail climbs into sparkling upper octaves (Valhalla Shimmer / Eno-Lanois class).
// The in-loop shifter is a 2-tap delay-line shifter (×2 playback, crossfaded grains):
// loop-friendly; offline high-quality shifting lives in @audio/shift-*.

const COMBS = [1557, 1617, 1491, 1422]

/**
 * @param {Float32Array} data — mono PCM, processed in place
 * @param {object} opts — { decay=0.7 (0..1), shimmer=0.5 (0..1 share of the feedback returned an octave up),
 *   damping=0.3, mix=0.4, fs=44100 }
 */
export default function shimmer (data, { decay = 0.7, shimmer = 0.5, damping = 0.3, mix = 0.4, fs = 44100 } = {}) {
	let sc = fs / 44100
	let combs = COMBS.map(d => ({ buf: new Float64Array(Math.max(1, Math.round(d * sc))), i: 0, lp: 0 }))
	let fb = 0.5 + 0.45 * decay

	// octave-up delay-line shifter: two taps half a window apart whose delays fall one
	// sample per sample (×2 playback); each fades out where its delay jumps back to W
	let W = Math.max(64, Math.round(2048 * sc)), N = W + 2
	let ring = new Float64Array(N)
	let w = 0, ph = 0
	let tap = d => {
		let p = w - d; if (p < 0) p += N
		let i0 = p | 0, frac = p - i0
		return ring[i0] * (1 - frac) + ring[(i0 + 1) % N] * frac
	}

	for (let i = 0; i < data.length; i++) {
		// previous wet sum
		let wet = 0
		for (let c of combs) wet += c.buf[c.i]
		wet /= combs.length

		// octave-up copy of the wet signal: triangular gains sum to 1 and are 0 at each jump
		ring[w] = wet
		let g = 1 - Math.abs(2 * ph - 1)
		let up = tap(W * (1 - ph)) * g + tap(W * (1 - (ph < 0.5 ? ph + 0.5 : ph - 0.5))) * (1 - g)
		if ((ph += 1 / W) >= 1) ph -= 1
		w = (w + 1) % N

		// `shimmer` is the share of the feedback that returns an octave up, so the loop gain
		// stays fb < 1 (added on top of fb, the loop gained up to 1.8 and grew without bound)
		let inject = data[i] * 0.7
		for (let c of combs) {
			let y = c.buf[c.i]
			c.lp = y * (1 - damping) + c.lp * damping
			c.buf[c.i] = inject + fb * (c.lp * (1 - shimmer) + up * shimmer)
			if (++c.i >= c.buf.length) c.i = 0
		}

		data[i] = data[i] * (1 - mix) + wet * mix
	}
	return data
}
