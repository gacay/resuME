"use client";

import { useEffect, useRef, useState } from "react";

// A pink star-shaped audio visualizer with its own play/pause control.
// It owns an <audio> element (the song) and, once the user has interacted,
// wires it through the Web Audio API so a row of five-pointed stars can pulse
// to the live frequency data. When `active` flips true (the Girly Pop switch
// is turned on) the track auto-plays; flipping it false pauses.

interface Props {
  /** True when Girly Pop mode is on — triggers auto-play / auto-pause. */
  active: boolean;
  /** Path to the audio file (served from /public). */
  src: string;
  title?: string;
  artist?: string;
}

/** Trace a five-pointed star centered at (cx, cy). */
function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  rotation: number,
) {
  const points = 5;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / points - Math.PI / 2 + rotation;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function MusicVisualizer({
  active,
  src,
  title = "Girl Like Me",
  artist = "PinkPantheress",
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const rotationRef = useRef(0);

  const [playing, setPlaying] = useState(false);

  // Lazily build the Web Audio graph — must run after a user gesture.
  function ensureGraph() {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      // Web Audio unavailable — the plain <audio> still plays, just no bars.
    }
  }

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Keep the backing store in sync with the CSS size (crisp on HiDPI).
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const analyser = analyserRef.current;
    const data = dataRef.current;
    const STARS = 12;

    rotationRef.current += 0.02;

    let values: number[];
    if (analyser && data && playing) {
      analyser.getByteFrequencyData(data);
      values = Array.from({ length: STARS }, (_, i) => {
        const idx = Math.floor((i / STARS) * data.length);
        return data[idx] / 255;
      });
    } else {
      // Idle shimmer when not playing / no analyser.
      const t = Date.now() / 400;
      values = Array.from({ length: STARS }, (_, i) => {
        const base = playing ? 0.35 : 0.12;
        return base + 0.12 * (0.5 + 0.5 * Math.sin(t + i * 0.6));
      });
    }

    const gap = cssW / STARS;
    for (let i = 0; i < STARS; i++) {
      const v = values[i];
      const cx = gap * i + gap / 2;
      const cy = cssH / 2;
      const maxOuter = Math.min(gap * 0.55, cssH * 0.42);
      // Clamp to the nearest canvas edge so the outermost stars' points
      // never get clipped by the canvas bounds.
      const edgeLimit = Math.min(cx, cssW - cx, cy) - 1;
      const outer = Math.max(3, Math.min(maxOuter * (0.35 + v), edgeLimit));
      const inner = outer * 0.45;

      const hue = 320 + i * 3;
      const light = 55 + v * 20;
      ctx.fillStyle = `hsl(${hue}, 100%, ${light}%)`;
      // Tie the glow to each star's own hue/lightness (instead of a fixed
      // magenta) and keep it soft, so it blends into the player's white/pink
      // glass panel rather than sitting on top as a flat wash.
      ctx.shadowColor = `hsla(${hue}, 100%, ${light}%, ${0.4 + v * 0.35})`;
      ctx.shadowBlur = 3 + v * 7;
      starPath(ctx, cx, cy, outer, inner, rotationRef.current + i * 0.3);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    rafRef.current = requestAnimationFrame(draw);
  }

  // Run the draw loop for the component's whole lifetime.
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  async function play() {
    const audio = audioRef.current;
    if (!audio) return;
    ensureGraph();
    try {
      await audioCtxRef.current?.resume();
      await audio.play();
      setPlaying(true);
    } catch {
      // Autoplay blocked by the browser — the user can press play manually.
    }
  }

  function pause() {
    audioRef.current?.pause();
    setPlaying(false);
  }

  function toggle() {
    if (playing) pause();
    else play();
  }

  // Auto play/pause when Girly Pop mode flips.
  useEffect(() => {
    if (active) play();
    else pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="gp-player">
      <audio
        ref={audioRef}
        src={src}
        loop
        preload="auto"
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        className="gp-play-btn"
        onClick={toggle}
        aria-label={playing ? "Pause music" : "Play music"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="gp-player-meta">
        <span className="gp-player-title">✨ {title}</span>
        <span className="gp-player-artist">{artist}</span>
      </div>
      <canvas ref={canvasRef} className="gp-visualizer" />
    </div>
  );
}
