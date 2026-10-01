'use client';

import { useEffect, useRef } from 'react';

export function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let pointer = { x: -1000, y: -1000 };
    const particles: { x: number; y: number; vx: number; vy: number; radius: number }[] = [];

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles.length = 0;
      const count = Math.min(58, Math.floor((width * height) / 23000));
      for (let i = 0; i < count; i += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          radius: Math.random() * 1.4 + 0.5,
        });
      }
    };

    const move = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
    };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0 || particle.x > width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > height) particle.vy *= -1;

        const dx = pointer.x - particle.x;
        const dy = pointer.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 150 && distance > 0) {
          particle.x -= (dx / distance) * 0.16;
          particle.y -= (dy / distance) * 0.16;
        }

        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = 'rgba(160, 232, 197, 0.58)';
        context.fill();
        for (let j = i + 1; j < particles.length; j += 1) {
          const other = particles[j];
          const linkX = particle.x - other.x;
          const linkY = particle.y - other.y;
          const linkDistance = Math.sqrt(linkX * linkX + linkY * linkY);
          if (linkDistance < 112) {
            context.beginPath();
            context.moveTo(particle.x, particle.y);
            context.lineTo(other.x, other.y);
            context.strokeStyle = `rgba(160, 232, 197, ${0.11 * (1 - linkDistance / 112)})`;
            context.lineWidth = 0.7;
            context.stroke();
          }
        }
      }
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    frame = window.requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', move);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', move);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="ambient-canvas" />;
}
