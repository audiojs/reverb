// Spring reverb model — feedback loop of stretched (dispersive) allpass chains plus a
// short delay: the cascaded allpasses make group delay frequency-dependent, producing
// the characteristic spring "boing" chirps. Simplified digital spring after
// Parker & Välimäki, "Spring reverberation: a physical perspective" (DAFx-10) family.

const AP_COUNT = 24
const LOOP = 1801, PRE = 541   // samples at 44.1 kHz

/**
 * Seconds the output takes to fall 60 dB under the input once the input stops, at these settings. The loop returns
 * fb = 0.55 + 0.42·decay of what it read, so a loop of τ seconds falls by a factor F in τ·log10(F) / −log10(fb): 60 dB,
 * F = 1000, in 3τ / −log10(fb) (Schroeder, "Natural sounding artificial reverberation", JAES 10(3), 1962). τ is the
 * loop's longest delay at any frequency, so no mode is slower: the loop line, the allpass chain at its group delay's
 * peak, AP_COUNT·(1 + a)/(1 − a) samples, and the damping one-pole at its delay at DC, damping/(1 − damping) samples.
 * A held input builds the ring up to the loop's peak gain G times the input, so the ring falls F = 1000·G. G is at
 * DC: the input enters at 0.6, the chain's gain is 1 at every frequency, the one-pole's at most 1, at DC, and the two
 * output taps (0.7 now, 0.3 a pre-delay back) add to at most 1, at DC, so G = 0.6/(1 − fb). The pre-delay holds one
 * more copy. A damping of 1 never falls (the one-pole holds): Infinity.
 */
export function tail ({ decay = 0.6, tension = 0.5, damping = 0.4, fs = 44100 } = {}) {
	let a = 0.3 + 0.45 * tension, fb = 0.55 + 0.42 * decay, sc = fs / 44100
	let tau = (Math.max(1, Math.round(LOOP * sc)) + AP_COUNT * (1 + a) / (1 - a) + damping / (1 - damping)) / fs
	return tau * Math.log10(1000 * 0.6 / (1 - fb)) / Math.log10(1 / fb) + Math.max(1, Math.round(PRE * sc)) / fs
}

/** One channel's memory at `fs` for stream(): the allpass chain, the loop and the pre-delay, made once */
export function state (fs = 44100) {
	let sc = fs / 44100
	return {
		ap: new Float64Array(2 * AP_COUNT),   // each allpass's x1, y1
		loop: new Float64Array(Math.max(1, Math.round(LOOP * sc))), pre: new Float64Array(Math.max(1, Math.round(PRE * sc))),
		i: new Int32Array(2),   // the loop's and the pre-delay's positions
		lp: new Float64Array(1),
	}
}

/**
 * Streaming form: `n` frames of `data` in place, `s` carried from call to call. `p` holds decay, tension, damping and
 * mix as a host gives a processor its values, each a 1-length array, read at each call. `lanes`, when given, holds
 * decay and mix for each sample, from 0 and from M (a value the loop's feedback and the output scale by, moved sample
 * by sample); tension and damping, filters' coefficients, stay the call's.
 */
export function stream (data, p, s, n = data.length, lanes = NONE, M = 0) {
	let a = 0.3 + 0.45 * p.tension[0]       // dispersion allpass coefficient
	let fb = 0.55 + 0.42 * p.decay[0], damping = p.damping[0], mix = p.mix[0], ramp = lanes.length > 0
	let ap = s.ap, loop = s.loop, pre = s.pre, li = s.i[0], pi = s.i[1], lp = s.lp[0]

	for (let i = 0; i < n; i++) {
		if (ramp) { fb = 0.55 + 0.42 * lanes[i]; mix = lanes[M + i] }
		// early dispersion into the loop
		let x = data[i] * 0.6 + loop[li] * fb

		// first-order allpass chain: y = a·x + x1 − a·y1
		for (let k = 0; k < 2 * AP_COUNT; k += 2) {
			let y = a * x + ap[k] - a * ap[k + 1]
			ap[k] = x; ap[k + 1] = y
			x = y
		}
		lp = x * (1 - damping) + lp * damping
		loop[li] = lp
		if (++li >= loop.length) li = 0

		let wetPre = pre[pi]
		pre[pi] = lp
		if (++pi >= pre.length) pi = 0

		data[i] = data[i] * (1 - mix) + (lp * 0.7 + wetPre * 0.3) * mix
	}
	s.i[0] = li; s.i[1] = pi; s.lp[0] = lp
}
const NONE = new Float64Array(0)

/**
 * @param {Float32Array} data — mono PCM, processed in place
 * @param {object} opts — { decay=0.6 (0..1), tension=0.5 (0..1 → allpass coefficient),
 *   damping=0.4, mix=0.35, fs=44100 }
 */
export default function spring (data, { decay = 0.6, tension = 0.5, damping = 0.4, mix = 0.35, fs = 44100 } = {}) {
	stream(data, { decay: [decay], tension: [tension], damping: [damping], mix: [mix] }, state(fs))
	return data
}
