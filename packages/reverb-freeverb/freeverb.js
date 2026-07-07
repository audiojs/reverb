// Freeverb — Schroeder-Moorer reverb: 8 parallel LP-damped feedback combs + 4 series
// allpass diffusers per channel. Jezar's public-domain tuning (44.1 kHz constants,
// scaled to fs); right channel runs `spread`-offset delays for stereo width.

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
const ALLPASSES = [556, 441, 341, 225]
const SPREAD = 23
const FIXED_GAIN = 0.015
const SCALE_ROOM = 0.28, OFFSET_ROOM = 0.7, SCALE_DAMP = 0.4

function channelState (fs, offset) {
	let s = fs / 44100
	return {
		combs: COMBS.map(d => ({ buf: new Float64Array(Math.max(1, Math.round((d + offset) * s))), i: 0, store: 0 })),
		aps: ALLPASSES.map(d => ({ buf: new Float64Array(Math.max(1, Math.round((d + offset) * s))), i: 0 })),
	}
}

function processChannel (data, st, feedback, damp, mix) {
	for (let n = 0; n < data.length; n++) {
		let input = data[n] * FIXED_GAIN
		let out = 0
		for (let c of st.combs) {
			let y = c.buf[c.i]
			c.store = y * (1 - damp) + c.store * damp
			c.buf[c.i] = input + c.store * feedback
			if (++c.i >= c.buf.length) c.i = 0
			out += y
		}
		for (let a of st.aps) {
			let buf = a.buf[a.i]
			let y = -out + buf
			a.buf[a.i] = out + buf * 0.5
			if (++a.i >= a.buf.length) a.i = 0
			out = y
		}
		data[n] = data[n] * (1 - mix) + out * mix
	}
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
