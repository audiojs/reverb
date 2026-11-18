// Freeverb — Schroeder-Moorer reverb: 8 parallel LP-damped feedback combs + 4 series
// allpass diffusers per channel. Jezar's public-domain tuning (44.1 kHz constants,
// scaled to fs); right channel runs `spread`-offset delays for stereo width.

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
const ALLPASSES = [556, 441, 341, 225]
const SPREAD = 23
const FIXED_GAIN = 0.015
const SCALE_ROOM = 0.28, OFFSET_ROOM = 0.7, SCALE_DAMP = 0.4

/**
 * Seconds a stereo pair's output takes to fall 60 dB under the input once the input stops, at these settings. Each
 * comb returns fb = room·0.28 + 0.7 of what it read, so a comb of τ seconds falls by a factor F in τ·log10(F) /
 * −log10(fb): 60 dB, F = 1000, in 3τ / −log10(fb) (Schroeder, "Natural sounding artificial reverberation", JAES 10(3),
 * 1962). τ is the longest comb, the right channel's, with its damping one-pole's delay at DC, d/(1 − d) samples for
 * d = damp·0.4. A held input builds the ring up to the network's peak gain G times the input, so the ring falls F =
 * 1000·G. G: each of the eight combs takes 0.015 of the input, and its gain 1/|1 − fb·LP·z^−M| is at most 1/(1 − fb),
 * the one-pole LP's being at most 1, at DC; each of the four stages after them (y = z − u, z = u + 0.5·z a stage's
 * length back) is ((1 + g)z^−M − 1)/(1 − g·z^−M), whose magnitude falls with cos ω from (2 + g)/(1 + g) = 5/3 where
 * z^−M = −1 to 1 at DC. So G = 8·0.015/(1 − fb)·(5/3)⁴. What the comb holds plays out once more; then the stages ring
 * out: their poles' radius is 0.5^(1/M), so each falls 60 dB in M·ln(1000)/ln(2) samples (J. O. Smith, Introduction
 * to Digital Filters, a pole's decay time).
 */
export function tail ({ room = 0.5, damp = 0.5, fs = 44100 } = {}) {
	let s = fs / 44100, len = d => Math.max(1, Math.round((d + SPREAD) * s)), d = damp * SCALE_DAMP, fb = room * SCALE_ROOM + OFFSET_ROOM
	let comb = len(Math.max(...COMBS)), aps = ALLPASSES.reduce((t, a) => t + len(a), 0), G = COMBS.length * FIXED_GAIN / (1 - fb) * (5 / 3) ** 4
	return ((comb + d / (1 - d)) * Math.log10(1000 * G) / Math.log10(1 / fb) + comb + aps * Math.log(1000) / Math.LN2) / fs
}

export function channelState (fs, offset) {
	let s = fs / 44100, len = d => Math.max(1, Math.round((d + offset) * s))
	return {
		combs: COMBS.map(d => new Float64Array(len(d))), ci: new Int32Array(COMBS.length), store: new Float64Array(COMBS.length),
		aps: ALLPASSES.map(d => new Float64Array(len(d))), ai: new Int32Array(ALLPASSES.length),
		k: new Float64Array(3),   // feedback, damp, mix in force
	}
}

// n samples of data through one channel's state, at the feedback, damp and mix in st.k, or, where `lanes` holds them,
// at each sample's room (from 0) and mix (from M)
function run (data, st, n, lanes, M) {
	let feedback = st.k[0], damp = st.k[1], mix = st.k[2], ramp = lanes.length > 0
	let combs = st.combs, ci = st.ci, store = st.store, aps = st.aps, ai = st.ai
	for (let n0 = 0; n0 < n; n0++) {
		if (ramp) { feedback = lanes[n0] * SCALE_ROOM + OFFSET_ROOM; mix = lanes[M + n0] }
		let input = data[n0] * FIXED_GAIN
		let out = 0
		for (let c = 0; c < combs.length; c++) {
			let buf = combs[c], y = buf[ci[c]]
			store[c] = y * (1 - damp) + store[c] * damp
			buf[ci[c]] = input + store[c] * feedback
			if (++ci[c] >= buf.length) ci[c] = 0
			out += y
		}
		for (let a = 0; a < aps.length; a++) {
			let ab = aps[a], buf = ab[ai[a]]
			let y = -out + buf
			ab[ai[a]] = out + buf * 0.5
			if (++ai[a] >= ab.length) ai[a] = 0
			out = y
		}
		data[n0] = data[n0] * (1 - mix) + out * mix
	}
}

export function processChannel (data, st, feedback, damp, mix) {
	st.k[0] = feedback; st.k[1] = damp; st.k[2] = mix
	run(data, st, data.length, NONE, 0)
}
const NONE = new Float64Array(0)

/**
 * Streaming form of processChannel: `n` samples of `data` in place, `st` (channelState) carried from call to call.
 * `p` holds room, damp and mix as a host gives a processor its values, each a 1-length array, read at each call.
 * `lanes`, when given, holds room and mix for each sample, from 0 and from M (values the combs' feedback and the output
 * scale by, moved sample by sample); damp, a filter's coefficient, stays the call's.
 */
export function stream (data, p, st, n = data.length, lanes = NONE, M = 0) {
	st.k[0] = p.room[0] * SCALE_ROOM + OFFSET_ROOM; st.k[1] = p.damp[0] * SCALE_DAMP; st.k[2] = p.mix[0]
	run(data, st, n, lanes, M)
}

/**
 * @param {Float32Array|Float32Array[]} data — mono buffer or [L, R], processed in place
 * @param {object} opts — { room=0.5 (0..1), damp=0.5 (0..1), mix=0.33, fs=44100 }
 */
export default function freeverb (data, { room = 0.5, damp = 0.5, mix = 0.33, fs = 44100 } = {}) {
	let feedback = room * SCALE_ROOM + OFFSET_ROOM
	let d = damp * SCALE_DAMP
	if (data[0]?.length !== undefined) {
		processChannel(data[0], channelState(fs, 0), feedback, d, mix)
		processChannel(data[1], channelState(fs, SPREAD), feedback, d, mix)
	} else {
		processChannel(data, channelState(fs, 0), feedback, d, mix)
	}
	return data
}
