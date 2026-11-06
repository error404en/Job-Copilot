"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Canvas particle orb: points on a sphere displaced by layered sine noise,
 * slowly rotating. No dependencies; pauses when off-screen.
 */
export function ParticleOrb({ size: maxSize = 420, count = 1400 }: { size?: number; count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(Math.min(maxSize, 300));

  useEffect(() => {
    const fit = () => setSize(Math.max(220, Math.min(maxSize, window.innerWidth - 48)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [maxSize]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const pts = Array.from({ length: count }, (_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return { phi, theta, seed: Math.random() * 6.28 };
    });

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const time = reduce ? 0 : t / 1000;
      ctx.clearRect(0, 0, size, size);
      const R = size * 0.33;
      const rot = time * 0.25;
      for (const p of pts) {
        const wob =
          1 +
          0.22 * Math.sin(p.phi * 3 + time * 0.9 + p.seed * 0.3) * Math.cos(p.theta * 2 - time * 0.7) +
          0.1 * Math.sin(p.theta * 5 + time * 1.3);
        const r = R * wob;
        const x0 = r * Math.sin(p.phi) * Math.cos(p.theta + rot);
        const y0 = r * Math.cos(p.phi);
        const z0 = r * Math.sin(p.phi) * Math.sin(p.theta + rot);
        const depth = (z0 + R * 1.3) / (R * 2.6);
        const a = 0.12 + depth * 0.85;
        ctx.fillStyle = `rgba(235,235,240,${a.toFixed(3)})`;
        const s = 0.5 + depth * 1.3;
        ctx.fillRect(size / 2 + x0, size / 2 + y0, s, s);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [size, count]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}
