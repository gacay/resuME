"use client";

import { useEffect } from "react";

// While the loading screen is up, animate the browser-tab favicon into a
// little scooter driving across, echoing the loading page. When loading ends,
// the static nón lá favicon (app/icon.svg) is restored.
//
// Browsers don't animate SVG favicons, so we drive it from a 32×32 canvas:
// redraw the scooter at a shifting x each tick and repoint the icon <link> at
// the fresh PNG data URL.

function drawScooter(ctx: CanvasRenderingContext2D, x: number) {
  ctx.clearRect(0, 0, 32, 32);
  ctx.strokeStyle = "#7A5C2E";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // dashed road
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, 30.5);
  ctx.lineTo(32, 30.5);
  ctx.stroke();
  ctx.restore();

  const bw = x + 6; // back wheel
  const fw = x + 18; // front wheel
  const wy = 26;

  ctx.beginPath();
  ctx.arc(bw, wy, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(fw, wy, 3, 0, Math.PI * 2);
  ctx.stroke();

  // deck + fork
  ctx.beginPath();
  ctx.moveTo(bw, wy);
  ctx.lineTo(x + 9, 21);
  ctx.lineTo(x + 15, 21);
  ctx.lineTo(fw, wy);
  ctx.moveTo(x + 15, 21);
  ctx.lineTo(x + 19, 15);
  ctx.stroke();

  // rider torso + arm
  ctx.beginPath();
  ctx.moveTo(x + 11, 21);
  ctx.lineTo(x + 12, 14);
  ctx.lineTo(x + 17, 15);
  ctx.stroke();

  // nón lá
  ctx.beginPath();
  ctx.moveTo(x + 8.5, 12.5);
  ctx.lineTo(x + 12, 7.5);
  ctx.lineTo(x + 15.5, 12.5);
  ctx.closePath();
  ctx.stroke();
}

export function FaviconManager({ loading }: { loading: boolean }) {
  useEffect(() => {
    if (!loading) return;

    const head = document.head;
    // Take the static icon link(s) out of play so the scooter wins, then put
    // them back when loading ends.
    const existing = Array.from(
      head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
    );
    existing.forEach((l) => l.remove());

    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    head.appendChild(link);

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");

    let x = -10;
    let timer = 0;
    if (ctx) {
      const tick = () => {
        drawScooter(ctx, x);
        link.href = canvas.toDataURL("image/png");
        x += 2;
        if (x > 34) x = -10;
      };
      tick();
      timer = window.setInterval(tick, 110);
    }

    return () => {
      if (timer) clearInterval(timer);
      link.remove();
      existing.forEach((l) => head.appendChild(l));
    };
  }, [loading]);

  return null;
}
