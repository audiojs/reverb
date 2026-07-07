// Shimmer reverb — a reverb core whose feedback path is pitch-shifted up an octave,
// so the tail climbs into sparkling upper octaves (Valhalla Shimmer / Eno-Lanois class).
// The in-loop shifter is a 2-head varispeed ring buffer (×2 read rate, crossfaded grains) —
// loop-friendly; offline high-quality shifting lives in @audio/shift-*.

const COMBS = [1557, 1617, 1491, 1422]

/**
 * @param {Float32Array} data — mono PCM, processed in place
 * @param {object} opts — { decay=0.7 (0..1), shimmer=0.5 (0..1 octave-up feedback amount),
 *   damping=0.3, mix=0.4, fs=44100 }
 */
export default function shimmer (data, { decay = 0.7, shimmer = 0.5, damping = 0.3, mix = 0.4, fs = 44100 } = {}) {
	let sc = fs / 44100
	let combs = COMBS.map(d => ({ buf: new Float64Array(Math.max(1, Math.round(d * sc))), i: 0, lp: 0 }))
	let fb = 0.5 + 0.45 * decay

	// octave-up varispeed shifter: write head advances 1, two read heads advance 2
	let N = Math.max(64, Math.round(4096 * sc))
	let ring = new Float64Array(N)
	let w = 0, r = 0 // r = fractional read position (advances by 2)

	for (let i = 0; i < data.length; i++) {
		// previous wet sum
		let wet = 0
		for (let c of combs) wet += c.buf[c.i]
		wet /= combs.length

		// octave-up copy of the wet signal
		ring[w] = wet
		let head = (pos) => {
			let p = pos % N; if (p < 0) p += N
			let i0 = p | 0, frac = p - i0
			return ring[i0] * (1 - frac) + ring[(i0 + 1) % N] * frac
		}
		// two half-window-offset read heads with triangular crossfade
		let phase = (r % (N / 2)) / (N / 2)
		let g1 = 1 - Math.abs(2 * phase - 1)
		let up = head(r) * g1 + head(r + N / 2) * (1 - g1)
		r = (r + 2) % N
		w = (w + 1) % N

		let inject = data[i] * 0.7 + up * shimmer
		for (let c of combs) {
			let y = c.buf[c.i]
			c.lp = y * (1 - damping) + c.lp * damping
			c.buf[c.i] = inject + c.lp * fb
			if (++c.i >= c.buf.length) c.i = 0
		}

		data[i] = data[i] * (1 - mix) + wet * mix
	}
	return data
}
