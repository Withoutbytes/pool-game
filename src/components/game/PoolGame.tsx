'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';

const TABLE_WIDTH = 800;
const TABLE_HEIGHT = 400;
const BALL_RADIUS = 11.5;
const WALL_THICKNESS = 42;
const POCKET_RADIUS = 32;

interface BallData {
  number: number;
  color: string;
  isStriped: boolean;
  rotation: { x: number, y: number };
}

interface ChalkMark {
  x: number;
  y: number;
  opacity: number;
}

const PoolGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const requestRef = useRef<number | null>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const isAimingRef = useRef(false);
  const isMovingRef = useRef(false);
  const [score, setScore] = useState(0);
  const chalkMarksRef = useRef<ChalkMark[]>([]); // Use ref to prevent engine rebuild on update
  const [isAimingState, setIsAimingState] = useState(false);
  const [isMovingState, setIsMovingState] = useState(false);

  const ballMetadata = useRef<Map<number, BallData>>(new Map());

  const applyShot = useCallback(() => {
    if (!isAimingRef.current || !engineRef.current || isMovingRef.current) return;

    const world = engineRef.current.world;
    const cueBall = Matter.Composite.allBodies(world).find(b => b.label === 'cueBall');

    if (cueBall) {
      const dx = cueBall.position.x - mousePos.current.x;
      const dy = cueBall.position.y - mousePos.current.y;
      const angle = Math.atan2(dy, dx);
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 250);
      
      // Much higher force and energy transfer tuning
      const forceMultiplier = 0.0012; 
      Matter.Body.applyForce(cueBall, cueBall.position, {
        x: Math.cos(angle) * dist * forceMultiplier,
        y: Math.sin(angle) * dist * forceMultiplier
      });

      // Add a chalk mark at cue ball position silently (no re-render)
      chalkMarksRef.current.push({ x: cueBall.position.x, y: cueBall.position.y, opacity: 0.4 });
      if (chalkMarksRef.current.length > 10) chalkMarksRef.current.shift();
    }

    isAimingRef.current = false;
    setIsAimingState(false);
  }, []);

  useEffect(() => {
    const engine = Matter.Engine.create({ 
      gravity: { x: 0, y: 0 }, 
      enableSleeping: true,
      positionIterations: 10, // More precise collision
      velocityIterations: 10
    });
    engineRef.current = engine;
    const world = engine.world;

    // Walls - Table Cushions
    const walls = [
      Matter.Bodies.rectangle(TABLE_WIDTH * 0.25, -WALL_THICKNESS / 2, TABLE_WIDTH * 0.42, WALL_THICKNESS, { isStatic: true, label: 'wall', friction: 0.05, restitution: 0.8 }),
      Matter.Bodies.rectangle(TABLE_WIDTH * 0.75, -WALL_THICKNESS / 2, TABLE_WIDTH * 0.42, WALL_THICKNESS, { isStatic: true, label: 'wall', friction: 0.05, restitution: 0.8 }),
      Matter.Bodies.rectangle(TABLE_WIDTH * 0.25, TABLE_HEIGHT + WALL_THICKNESS / 2, TABLE_WIDTH * 0.42, WALL_THICKNESS, { isStatic: true, label: 'wall', friction: 0.05, restitution: 0.8 }),
      Matter.Bodies.rectangle(TABLE_WIDTH * 0.75, TABLE_HEIGHT + WALL_THICKNESS / 2, TABLE_WIDTH * 0.42, WALL_THICKNESS, { isStatic: true, label: 'wall', friction: 0.05, restitution: 0.8 }),
      Matter.Bodies.rectangle(-WALL_THICKNESS / 2, TABLE_HEIGHT / 2, WALL_THICKNESS, TABLE_HEIGHT * 0.75, { isStatic: true, label: 'wall', friction: 0.05, restitution: 0.8 }),
      Matter.Bodies.rectangle(TABLE_WIDTH + WALL_THICKNESS / 2, TABLE_HEIGHT / 2, WALL_THICKNESS, TABLE_HEIGHT * 0.75, { isStatic: true, label: 'wall', friction: 0.05, restitution: 0.8 }),
    ];

    const pocketPositions = [
      { x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: -8 }, { x: TABLE_WIDTH, y: 0 },
      { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT + 8 }, { x: TABLE_WIDTH, y: TABLE_HEIGHT }
    ];

    const ballConfigs = [
      { n: 1, c: '#FFD700', s: false }, { n: 2, c: '#0000FF', s: false }, { n: 3, c: '#FF0000', s: false },
      { n: 4, c: '#800080', s: false }, { n: 5, c: '#FFA500', s: false }, { n: 6, c: '#008000', s: false },
      { n: 7, c: '#800000', s: false }, { n: 8, c: '#000000', s: false }, { n: 9, c: '#FFD700', s: true },
      { n: 10, c: '#0000FF', s: true }, { n: 11, c: '#FF0000', s: true }, { n: 12, c: '#800080', s: true },
      { n: 13, c: '#FFA500', s: true }, { n: 14, c: '#008000', s: true }, { n: 15, c: '#800000', s: true }
    ];

    const createBallBody = (x: number, y: number, isCue: boolean, config?: typeof ballConfigs[0]) => {
      const body = Matter.Bodies.circle(x, y, BALL_RADIUS, {
        restitution: 0.95, // Max energy transfer
        friction: 0, // No friction with table surface directly
        frictionAir: 0.008, // Very low resistance for long rolls
        mass: isCue ? 6 : 3, // Heavier balls for momentum
        slop: 0.01,
        label: isCue ? 'cueBall' : 'ball'
      });
      
      if (!isCue && config) {
        ballMetadata.current.set(body.id, {
          number: config.n, color: config.c, isStriped: config.s,
          rotation: { x: Math.random() * Math.PI, y: Math.random() * Math.PI }
        });
      }
      return body;
    };

    const cueBall = createBallBody(TABLE_WIDTH * 0.25, TABLE_HEIGHT / 2, true);
    const ballsArray: Matter.Body[] = [cueBall];
    const startX = TABLE_WIDTH * 0.65;
    const startY = TABLE_HEIGHT / 2;
    let bIdx = 0;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j <= i; j++) {
        const x = startX + i * (BALL_RADIUS * 2 * 0.88);
        const y = startY + (j - i / 2) * (BALL_RADIUS * 2.1);
        ballsArray.push(createBallBody(x, y, false, ballConfigs[bIdx++]));
      }
    }

    Matter.Composite.add(world, [...walls, ...ballsArray]);

    Matter.Events.on(engine, 'afterUpdate', () => {
      const all = Matter.Composite.allBodies(world);
      const activeBalls = all.filter(b => b.label === 'ball' || b.label === 'cueBall');
      let moving = false;
      
      activeBalls.forEach(ball => {
        if (ball.speed > 0.08) {
          moving = true;
          const meta = ballMetadata.current.get(ball.id);
          if (meta) {
            meta.rotation.x += ball.velocity.x * 0.08;
            meta.rotation.y += ball.velocity.y * 0.08;
          }
        }
        pocketPositions.forEach(p => {
          const dist = Matter.Vector.magnitude(Matter.Vector.sub(ball.position, p));
          if (dist < POCKET_RADIUS) {
            if (ball.label === 'cueBall') {
              // Proper Cue Ball Reset
              Matter.Body.setPosition(ball, { x: TABLE_WIDTH * 0.25, y: TABLE_HEIGHT / 2 });
              Matter.Body.setVelocity(ball, { x: 0, y: 0 });
              Matter.Body.setAngularVelocity(ball, 0);
              Matter.Body.setInertia(ball, Infinity); // Momentarily freeze to prevent phantom movement
              setTimeout(() => {
                if (ball) Matter.Body.setInertia(ball, ball.mass * (BALL_RADIUS * BALL_RADIUS) / 2);
              }, 100);
            } else {
              Matter.Composite.remove(world, ball);
              setScore(s => s + 10);
            }
          }
        });
      });
      if (moving !== isMovingRef.current) { isMovingRef.current = moving; setIsMovingState(moving); }
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const r = canvasRef.current.getBoundingClientRect();
      mousePos.current = { x: (e.clientX - r.left) * (TABLE_WIDTH / r.width), y: (e.clientY - r.top) * (TABLE_HEIGHT / r.height) };
    };
    const onMouseUp = () => { if (isAimingRef.current) applyShot(); };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const drawBall = (body: Matter.Body) => {
      const { x, y } = body.position;
      const isCue = body.label === 'cueBall';
      const meta = ballMetadata.current.get(body.id);

      ctx.save();
      ctx.translate(x, y);

      // Deep Shadow
      ctx.beginPath();
      ctx.ellipse(3, 4, BALL_RADIUS, BALL_RADIUS * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      // Base Sphere
      ctx.beginPath();
      ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isCue ? '#fff' : (meta?.color || '#eee');
      ctx.fill();

      if (meta) {
        if (meta.isStriped) {
          ctx.beginPath();
          ctx.arc(0, 0, BALL_RADIUS, -0.6, 0.6);
          ctx.arc(0, 0, BALL_RADIUS, Math.PI - 0.6, Math.PI + 0.6);
          ctx.fillStyle = '#fff';
          ctx.fill();
        }

        const rotX = Math.sin(meta.rotation.x) * (BALL_RADIUS * 0.5);
        const rotY = Math.cos(meta.rotation.y) * (BALL_RADIUS * 0.5);
        const distFromCenter = Math.sqrt(rotX*rotX + rotY*rotY);
        const circleSize = Math.max(0.1, (1 - distFromCenter/BALL_RADIUS)) * 0.5;

        ctx.beginPath();
        ctx.arc(rotX, rotY, BALL_RADIUS * circleSize, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        if (circleSize > 0.3) {
          ctx.fillStyle = '#000';
          ctx.font = `bold ${BALL_RADIUS * circleSize}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(meta.number.toString(), rotX, rotY);
        }
      }

      // Gloss & Highlight
      const grad = ctx.createRadialGradient(-BALL_RADIUS*0.35, -BALL_RADIUS*0.35, BALL_RADIUS*0.05, 0, 0, BALL_RADIUS);
      grad.addColorStop(0, 'rgba(255,255,255,0.7)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.1)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const animate = (t: number) => {
      Matter.Engine.update(engine, 1000 / 60);
      ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      
      // Realistic Felt Texture
      ctx.fillStyle = '#1b5e20';
      ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      for(let i=0; i<TABLE_WIDTH; i+=4) {
        for(let j=0; j<TABLE_HEIGHT; j+=4) {
          if(Math.random() > 0.8) ctx.fillRect(i, j, 1, 1);
        }
      }

      // Chalk Marks
      chalkMarksRef.current.forEach(m => {
        ctx.beginPath();
        ctx.arc(m.x, m.y, 4, 0, Math.PI*2);
        ctx.fillStyle = `rgba(100, 200, 255, ${m.opacity})`;
        ctx.fill();
      });

      // Table Branding / Center Mark
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(TABLE_WIDTH/2, TABLE_HEIGHT/2, 2, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(TABLE_WIDTH*0.25, TABLE_HEIGHT/2, 2, 0, Math.PI*2); ctx.stroke();

      // Pockets
      pocketPositions.forEach(p => {
        ctx.fillStyle = '#0a2a0d';
        ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_RADIUS * 0.85, 0, Math.PI * 2); ctx.fill();
      });

      // Bodies
      const bodies = Matter.Composite.allBodies(world);
      bodies.forEach(b => { if (b.label !== 'wall') drawBall(b); });

      // Aiming UI & Cue Shadow
      const cue = bodies.find(b => b.label === 'cueBall');
      if (isAimingRef.current && cue && !isMovingRef.current) {
        const dx = cue.position.x - mousePos.current.x, dy = cue.position.y - mousePos.current.y;
        const angle = Math.atan2(dy, dx), dist = Math.min(Math.sqrt(dx*dx + dy*dy), 250);
        
        // Prediction Line
        ctx.beginPath(); ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.moveTo(cue.position.x, cue.position.y);
        ctx.lineTo(cue.position.x + Math.cos(angle) * 600, cue.position.y + Math.sin(angle) * 600);
        ctx.stroke(); ctx.setLineDash([]);

        const offset = BALL_RADIUS + 12 + (dist * 0.15);
        
        // Cue Shadow
        ctx.save();
        ctx.translate(2, 4);
        ctx.beginPath(); ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.moveTo(cue.position.x - Math.cos(angle)*offset, cue.position.y - Math.sin(angle)*offset);
        ctx.lineTo(cue.position.x - Math.cos(angle)*(offset+300), cue.position.y - Math.sin(angle)*(offset+300));
        ctx.stroke();
        ctx.restore();

        // Wood Cue
        ctx.beginPath(); ctx.lineWidth = 6; ctx.lineCap = 'round';
        const cueGrad = ctx.createLinearGradient(
            cue.position.x - Math.cos(angle)*offset, cue.position.y - Math.sin(angle)*offset,
            cue.position.x - Math.cos(angle)*(offset+300), cue.position.y - Math.sin(angle)*(offset+300)
        );
        cueGrad.addColorStop(0, '#d7ccc8'); cueGrad.addColorStop(0.1, '#5d4037'); cueGrad.addColorStop(1, '#3e2723');
        ctx.strokeStyle = cueGrad;
        ctx.moveTo(cue.position.x - Math.cos(angle)*offset, cue.position.y - Math.sin(angle)*offset);
        ctx.lineTo(cue.position.x - Math.cos(angle)*(offset+300), cue.position.y - Math.sin(angle)*(offset+300));
        ctx.stroke();
      }

      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      Matter.Engine.clear(engine);
    };
  }, [applyShot]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 p-4 text-white select-none overflow-hidden font-sans">
      <div className="mb-6 text-center">
        <h1 className="text-6xl font-black tracking-tighter uppercase italic bg-gradient-to-b from-emerald-400 to-emerald-600 bg-clip-text text-transparent drop-shadow-2xl">Bun Sinuca Elite</h1>
        <div className="mt-2 flex items-center justify-center gap-4">
          <div className="bg-zinc-900/80 px-6 py-2 rounded-2xl border border-white/5 shadow-inner flex items-center gap-4">
            <div className="flex flex-col items-start">
                <span className="text-emerald-500/50 text-[9px] font-black tracking-widest uppercase">Score</span>
                <span className="font-mono text-2xl text-white font-bold leading-none">{score.toString().padStart(4, '0')}</span>
            </div>
            <div className="w-[1px] h-8 bg-white/10" />
            <div className="flex flex-col items-start">
                <span className="text-emerald-500/50 text-[9px] font-black tracking-widest uppercase">Status</span>
                <span className={`text-xs font-bold uppercase tracking-tighter ${isMovingState ? 'text-amber-500' : 'text-emerald-400'}`}>
                    {isMovingState ? 'Rolling...' : 'Ready'}
                </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="relative group p-1 bg-gradient-to-br from-amber-800 to-amber-950 rounded-[40px] shadow-[0_50px_100px_-20px_rgba(0,0,0,1)]">
        <div className="relative p-4 bg-emerald-900/10 rounded-[35px] backdrop-blur-sm">
          <div className="relative border-[20px] border-amber-950 rounded-2xl shadow-2xl overflow-hidden">
            {/* Table Cushion Highlights */}
            <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-lg z-10" />
            <canvas ref={canvasRef} width={TABLE_WIDTH} height={TABLE_HEIGHT} onMouseDown={() => { if (!isMovingRef.current) { isAimingRef.current = true; setIsAimingState(true); } }} className="block" />
          </div>
        </div>
      </div>

      <div className="mt-10 flex gap-6 overflow-x-auto pb-4 max-w-full px-4 no-scrollbar">
        {[
          { t: "Física de Elite", d: "Bolas pesadas com atrito de pano silk para rolagem infinita." },
          { t: "Feedback Tátil", d: "Marcas de giz surgem na mesa após tacadas potentes." },
          { t: "Visual Imersivo", d: "Sombras dinâmicas, taco de madeira e textura de feltro real." }
        ].map((item, i) => (
          <div key={i} className="min-w-[260px] bg-zinc-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-md">
            <h3 className="text-emerald-400 font-black mb-2 text-xs uppercase tracking-widest">{item.t}</h3>
            <p className="text-zinc-500 text-xs leading-relaxed">{item.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PoolGame;
