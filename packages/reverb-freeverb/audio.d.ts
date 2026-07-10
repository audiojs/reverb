// Generated from the audio.js manifest (params metadata is the source of truth).
// Regenerate: node tools/dts.js in @audio/compile. Do not edit by hand.

/** Automatable number — scalar, `t => value` fn, or breakpoint curve {t, v} */
type Auto = number | ((t: number) => number) | { t: number[], v: number[] }
/** Per-block param values as delivered by hosts (numbers arrive as 1-length Float32Array) */
type Live = Record<string, Float32Array | string | boolean>
type Ctx = { sampleRate: number, maxBlockSize: number, maxChannels: number, currentTime: number, duration?: number, events?: readonly any[], emit?: (name: string, ...args: any[]) => void, [k: string]: unknown }
type Process = (inputs: Float32Array[][], outputs: Float32Array[][], params: Live) => void

/** Chainable-host options for 'freeverb' */
export interface FreeverbOptions {
  /** 0..1 (default 0.5) */
  "room"?: Auto
  /** 0..1 (default 0.5) */
  "damp"?: Auto
  /** 0..1 (default 0.33) */
  "mix"?: Auto
  at?: number | string
  duration?: number | string
}

export declare const freeverb: {
  (ctx: Ctx): Process
  channels: "any"
  tail: 6
  params: {
    /** 0..1 (default 0.5) */
    "room": { type: "number", default: 0.5 }
    /** 0..1 (default 0.5) */
    "damp": { type: "number", default: 0.5 }
    /** 0..1 (default 0.33) */
    "mix": { type: "number", default: 0.33 }
  }
}
