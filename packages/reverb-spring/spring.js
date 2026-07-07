// Spring reverb model — feedback loop of stretched (dispersive) allpass chains plus a
// short delay: the cascaded allpasses make group delay frequency-dependent, producing
// the characteristic spring "boing" chirps. Simplified digital spring after
// Parker & Välimäki, "Spring reverberation: a physical perspective" (DAFx-10) family.

const AP_COUNT = 24

/**
 * @param {Float32Array} data — mono PCM, processed in place
 * @param {object} opts — { decay=0.6 (0..1), tension=0.5 (0..1 → allpass coefficient),
 *   damping=0.4, mix=0.35, fs=44100 }
 */
export default function spring (data, { decay = 0.6, tension = 0.5, damping = 0.4, mix = 0.35, fs = 44100 } = {}) {
	let sc = fs / 44100
	let a = 0.3 + 0.45 * tension              // dispersion allpass coefficient
	let aps = Array.from({ length: AP_COUNT }, () => ({ x1: 0, y1: 0 }))
	let loop = { buf: new Float64Array(Math.max(1, Math.round(1801 * sc))), i: 0 }
	let pre = { buf: new Float64Array(Math.max(1, Math.round(541 * sc))), i: 0 }
	let lp = 0, fb = 0.55 + 0.42 * decay

	for (let i = 0; i < data.length; i++) {
		// early dispersion into the loop
		let x = data[i] * 0.6 + loop.buf[loop.i] * fb

		// first-order allpass chain: y = a·x + x1 − a·y1
		for (let ap of aps) {
			let y = a * x + ap.x1 - a * ap.y1
			ap.x1 = x; ap.y1 = y
			x = y
		}
		lp = x * (1 - damping) + lp * damping
		loop.buf[loop.i] = lp
		if (++loop.i >= loop.buf.length) loop.i = 0

		let wetPre = pre.buf[pre.i]
		pre.buf[pre.i] = lp
		if (++pre.i >= pre.buf.length) pre.i = 0

		data[i] = data[i] * (1 - mix) + (lp * 0.7 + wetPre * 0.3) * mix
	}
	return data
}
