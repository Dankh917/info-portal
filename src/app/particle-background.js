"use client";

import { useEffect, useRef } from "react";

export default function ParticleBackground() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: null, y: null });
  const particlesRef = useRef([]);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let width = window.innerWidth;
    let height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    // Particle class
    class Particle {
      constructor() {
        this.reset();
        this.y = Math.random() * height;
      }

      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.baseX = this.x;
        this.baseY = this.y;
        this.size = Math.random() * 3 + 1;
        this.density = Math.random() * 30 + 1;
        this.vx = Math.random() * 0.5 - 0.25;
        this.vy = Math.random() * 0.5 - 0.25;
      }

      draw() {
        ctx.fillStyle = "rgba(139, 92, 246, 0.6)";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }

      update() {
        const mouse = mouseRef.current;

        // Drift back to base position
        const dx = this.baseX - this.x;
        const dy = this.baseY - this.y;
        this.x += dx * 0.05;
        this.y += dy * 0.05;

        // Add gentle floating motion
        this.baseX += this.vx;
        this.baseY += this.vy;

        // Wrap around edges
        if (this.baseX < 0) this.baseX = width;
        if (this.baseX > width) this.baseX = 0;
        if (this.baseY < 0) this.baseY = height;
        if (this.baseY > height) this.baseY = 0;

        // Mouse interaction - push away
        if (mouse.x !== null && mouse.y !== null) {
          const distX = this.x - mouse.x;
          const distY = this.y - mouse.y;
          const distance = Math.sqrt(distX * distX + distY * distY);
          const maxDistance = 150;

          if (distance < maxDistance && distance > 0) {
            const force = (maxDistance - distance) / maxDistance;
            const repelX = (distX / distance) * force * this.density * 0.6;
            const repelY = (distY / distance) * force * this.density * 0.6;
            this.x += repelX;
            this.y += repelY;
          }
        }
      }
    }

    // Initialize particles
    const initParticles = () => {
      particlesRef.current = [];
      const numberOfParticles = Math.floor((width * height) / 9000);
      for (let i = 0; i < numberOfParticles; i++) {
        particlesRef.current.push(new Particle());
      }
    };

    // Connect particles with lines
    const connectParticles = () => {
      const particles = particlesRef.current;
      const maxDistance = 120;

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < maxDistance) {
            const opacity = (1 - distance / maxDistance) * 0.3;
            ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      particlesRef.current.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      connectParticles();

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Mouse move handler
    const handleMouseMove = (e) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    // Mouse leave handler
    const handleMouseLeave = () => {
      mouseRef.current.x = null;
      mouseRef.current.y = null;
    };

    // Resize handler
    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      initParticles();
    };

    // Initialize
    initParticles();
    animate();

    // Event listeners
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
