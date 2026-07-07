// Dattorro plate reverb — input diffusion (4 allpasses) into a figure-eight tank of two
// cross-coupled branches (allpass → delay → damping → decay → allpass → delay).
// Modulation omitted (static tank). Structure, delay lengths and output taps from Dattorro, "Effect Design Part 1:
// Reverberator and Other Filters", JAES 45(9), 1997 (reference rate 29761 Hz, scaled to fs).

const REF = 29761

class Delay {
	constructor (n) { this.buf = new Float64Array(Math.max(1, n)); this.i = 0 }
	read (tap) { let j = this.i - tap; j %= this.buf.length; if (j < 0) j += this.buf.length; return this.buf[j] }
	step (x) { this.buf[this.i] = x; if (++this.i >= this.buf.length) this.i = 0 }
	tail () { return this.read(this.buf.length - 1) }
}
class Allpass {
	constructor (n, g) { this.d = new Delay(n); this.g = g }
	step (x) {
		let z = this.d.read(this.d.buf.length - 1)
		let y = x + z * -this.g
		this.d.step(y)
		return z + y * this.g
	}
	read (tap) { return this.d.read(tap) }
}

/**
 * @param {Float32Array|Float32Array[]} data — mono buffer or [L, R], processed in place
 * @param {object} opts — { decay=0.5 (0..1), damping=0.3 (0..1), bandwidth=0.9995,
 *   mix=0.3, fs=44100 }
 */
export default function dattorro (data, { decay = 0.5, damping = 0.3, bandwidth = 0.9995, mix = 0.3, fs = 44100 } = {}) {
	let sc = fs / REF
	let S = n => Math.max(1, Math.round(n * sc))

	// input chain
	let lpIn = 0
	let inAp = [new Allpass(S(142), 0.75), new Allpass(S(107), 0.75), new Allpass(S(379), 0.625), new Allpass(S(277), 0.625)]
	// tank branch 1
	let ap1 = new Allpass(S(672), 0.7)
	let del1a = new Delay(S(4453))
	let lp1 = 0
	let ap1b = new Allpass(S(1800), 0.5)
	let del1b = new Delay(S(3720))
	// tank branch 2
	let ap2 = new Allpass(S(908), 0.7)
	let del2a = new Delay(S(4217))
	let lp2 = 0
	let ap2b = new Allpass(S(2656), 0.5)
	let del2b = new Delay(S(3163))

	let stereo = data[0]?.length !== undefined
	let L = stereo ? data[0] : data
	let R = stereo ? data[1] : null
	let n = L.length

	for (let i = 0; i < n; i++) {
		let dry = stereo ? (L[i] + R[i]) * 0.5 : L[i]

		lpIn = dry * bandwidth + lpIn * (1 - bandwidth)
		let x = lpIn
		for (let ap of inAp) x = ap.step(x)

		// figure-eight: each branch is fed by the other branch's end
		let in1 = x + del2b.tail() * decay
		let in2 = x + del1b.tail() * decay

		let a = ap1.step(in1)
		del1a.step(a)
		lp1 = del1a.tail() * (1 - damping) + lp1 * damping
		let b = ap1b.step(lp1 * decay)
		del1b.step(b)

		let c = ap2.step(in2)
		del2a.step(c)
		lp2 = del2a.tail() * (1 - damping) + lp2 * damping
		let d = ap2b.step(lp2 * decay)
		del2b.step(d)

		// output taps (Dattorro Table 2), scaled
		let yL = 0.6 * (del2a.read(S(266)) + del2a.read(S(2974)) - ap2b.read(S(1913)) + del2b.read(S(1996))
			- del1a.read(S(1990)) - ap1b.read(S(187)) - del1b.read(S(1066)))
		let yR = 0.6 * (del1a.read(S(353)) + del1a.read(S(3627)) - ap1b.read(S(1228)) + del1b.read(S(2673))
			- del2a.read(S(2111)) - ap2b.read(S(335)) - del2b.read(S(121)))

		if (stereo) {
			L[i] = L[i] * (1 - mix) + yL * mix
			R[i] = R[i] * (1 - mix) + yR * mix
		} else {
			L[i] = L[i] * (1 - mix) + (yL + yR) * 0.5 * mix
		}
	}
	return data
}
