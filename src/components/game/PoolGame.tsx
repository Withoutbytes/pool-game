'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Matter from 'matter-js';
import * as THREE from 'three';

// Constants
const TABLE_WIDTH = 800;
const TABLE_HEIGHT = 400;
const BALL_RADIUS = 10;
const WALL_THICKNESS = 40;
const POCKET_RADIUS = 18;

const ballConfigs = [
  { n: 1, c: '#ffeb3b', s: false }, { n: 2, c: '#1976d2', s: false },
  { n: 3, c: '#d32f2f', s: false }, { n: 4, c: '#7b1fa2', s: false },
  { n: 5, c: '#f57c00', s: false }, { n: 6, c: '#388e3c', s: false },
  { n: 7, c: '#8d6e63', s: false }, { n: 8, c: '#000000', s: false },
  { n: 9, c: '#ffeb3b', s: true }, { n: 10, c: '#1976d2', s: true },
  { n: 11, c: '#d32f2f', s: true }, { n: 12, c: '#7b1fa2', s: true },
  { n: 13, c: '#f57c00', s: true }, { n: 14, c: '#388e3c', s: true },
  { n: 15, c: '#8d6e63', s: true }
];

const PoolGame: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const balls3D = useRef<Map<number, THREE.Mesh>>(new Map());
  const cueRef = useRef<THREE.Group | null>(null);
  
  const [score, setScore] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const isMovingRef = useRef(false);
  const isAimingRef = useRef(false);
  const mousePos = useRef({ x: 0, y: 0 });

  const initPhysics = () => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    
    const createWall = (x: number, y: number, w: number, h: number) => {
      return Matter.Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0, restitution: 0.8 });
    };

    const walls = [
      createWall(TABLE_WIDTH / 2, -WALL_THICKNESS / 2, TABLE_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS),
      createWall(TABLE_WIDTH / 2, TABLE_HEIGHT + WALL_THICKNESS / 2, TABLE_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS),
      createWall(-WALL_THICKNESS / 2, TABLE_HEIGHT / 2, WALL_THICKNESS, TABLE_HEIGHT + WALL_THICKNESS * 2),
      createWall(TABLE_WIDTH + WALL_THICKNESS / 2, TABLE_HEIGHT / 2, WALL_THICKNESS, TABLE_HEIGHT + WALL_THICKNESS * 2),
    ];

    const balls: Matter.Body[] = [];
    const cueBall = Matter.Bodies.circle(TABLE_WIDTH * 0.25, TABLE_HEIGHT / 2, BALL_RADIUS, {
      restitution: 0.95, friction: 0.001, frictionAir: 0.012, mass: 6, label: 'cueBall'
    });
    balls.push(cueBall);

    // Rack balls
    const startX = TABLE_WIDTH * 0.7;
    const startY = TABLE_HEIGHT / 2;
    let ballIdx = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const x = startX + row * (BALL_RADIUS * 1.75);
        const y = startY + (col - row / 2) * (BALL_RADIUS * 2.1);
        const ball = Matter.Bodies.circle(x, y, BALL_RADIUS, {
          restitution: 0.95, friction: 0.001, frictionAir: 0.012, mass: 3, label: 'ball'
        });
        (ball as any).config = ballConfigs[ballIdx++];
        balls.push(ball);
      }
    }

    Matter.Composite.add(engine.world, [...walls, ...balls]);
    engineRef.current = engine;
    return { engine, cueBall, balls };
  };

  const createBallTexture = (config: typeof ballConfigs[0] | undefined, isCue: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    
    // Background
    ctx.fillStyle = isCue ? '#ffffff' : (config?.c || '#eeeeee');
    ctx.fillRect(0, 0, 256, 128);

    if (config?.s) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 64, 128);
      ctx.fillRect(192, 0, 64, 128);
    }

    if (!isCue && config) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(128, 64, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 40px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.n.toString(), 128, 64);
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  };

  const initThree = (physicsBalls: Matter.Body[]) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(TABLE_WIDTH / 2, 800, TABLE_HEIGHT / 2 + 600);
    camera.lookAt(TABLE_WIDTH / 2, -50, TABLE_HEIGHT / 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current?.appendChild(renderer.domElement);

    // Lights - Modern Studio Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const topLight = new THREE.RectAreaLight(0xffffff, 5, TABLE_WIDTH, TABLE_HEIGHT);
    topLight.position.set(TABLE_WIDTH / 2, 400, TABLE_HEIGHT / 2);
    topLight.lookAt(TABLE_WIDTH / 2, 0, TABLE_HEIGHT / 2);
    scene.add(topLight);

    const mainLight = new THREE.SpotLight(0xffffff, 3);
    mainLight.position.set(TABLE_WIDTH / 2, 1000, TABLE_HEIGHT / 2);
    mainLight.angle = Math.PI / 3;
    mainLight.penumbra = 0.2;
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 4096;
    mainLight.shadow.mapSize.height = 4096;
    scene.add(mainLight);

    const rimLight = new THREE.PointLight(0x40e0d0, 1, 1000); // Modern cyan accent
    rimLight.position.set(TABLE_WIDTH / 2, 50, TABLE_HEIGHT / 2);
    scene.add(rimLight);

    // Materials
    const feltMat = new THREE.MeshStandardMaterial({ 
      color: 0x004d40, // Deep Teal/Modern Green
      roughness: 0.9,
      metalness: 0.05
    });

    const woodMat = new THREE.MeshStandardMaterial({ 
      color: 0x0a0a0a, // Matte Black Wood
      roughness: 0.4,
      metalness: 0.3
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.1,
      metalness: 1.0
    });

    // Table Floor (Felt)
    const tableGeo = new THREE.BoxGeometry(TABLE_WIDTH, 12, TABLE_HEIGHT);
    const table = new THREE.Mesh(tableGeo, feltMat);
    table.position.set(TABLE_WIDTH / 2, -6, TABLE_HEIGHT / 2);
    table.receiveShadow = true;
    scene.add(table);

    // Rails (Modern Matte)
    const createRail = (x: number, y: number, z: number, w: number, h: number, d: number) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, woodMat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        
        // Add chrome accent line
        const lineGeo = new THREE.BoxGeometry(w + 2, 2, d + 2);
        const line = new THREE.Mesh(lineGeo, chromeMat);
        line.position.set(x, y + h/2, z);
        scene.add(line);
    };

    // Adjusted rails to show pockets at corners and centers
    const railH = 35;
    const rw = TABLE_WIDTH / 2 - POCKET_RADIUS * 1.5;
    const rh = TABLE_HEIGHT - POCKET_RADIUS * 3;

    // Top rails
    createRail(TABLE_WIDTH * 0.25 + 5, 10, -WALL_THICKNESS / 2, rw, railH, WALL_THICKNESS);
    createRail(TABLE_WIDTH * 0.75 - 5, 10, -WALL_THICKNESS / 2, rw, railH, WALL_THICKNESS);
    // Bottom rails
    createRail(TABLE_WIDTH * 0.25 + 5, 10, TABLE_HEIGHT + WALL_THICKNESS / 2, rw, railH, WALL_THICKNESS);
    createRail(TABLE_WIDTH * 0.75 - 5, 10, TABLE_HEIGHT + WALL_THICKNESS / 2, rw, railH, WALL_THICKNESS);
    // Side rails
    createRail(-WALL_THICKNESS / 2, 10, TABLE_HEIGHT / 2, WALL_THICKNESS, railH, rh);
    createRail(TABLE_WIDTH + WALL_THICKNESS / 2, 10, TABLE_HEIGHT / 2, WALL_THICKNESS, railH, rh);

    // Pockets (Visual)
    const pocketGeo = new THREE.CylinderGeometry(POCKET_RADIUS, POCKET_RADIUS, 5, 32);
    const pocketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const pockets = [
        {x:0, y:0}, {x:TABLE_WIDTH/2, y:0}, {x:TABLE_WIDTH, y:0},
        {x:0, y:TABLE_HEIGHT}, {x:TABLE_WIDTH/2, y:TABLE_HEIGHT}, {x:TABLE_WIDTH, y:TABLE_HEIGHT}
    ];
    pockets.forEach(p => {
        const mesh = new THREE.Mesh(pocketGeo, pocketMat);
        mesh.position.set(p.x, 0.1, p.y);
        scene.add(mesh);
        
        // Chrome rim for pocket
        const ringGeo = new THREE.TorusGeometry(POCKET_RADIUS, 2, 16, 32);
        ringGeo.rotateX(Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, chromeMat);
        ring.position.set(p.x, 2, p.y);
        scene.add(ring);
    });

    // Modern Square Legs
    const legSize = 70;
    const legGeo = new THREE.BoxGeometry(legSize, 300, legSize);
    const createLeg = (x: number, z: number) => {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(x, -150, z);
      leg.castShadow = true;
      scene.add(leg);
      
      // Chrome base for leg
      const baseGeo = new THREE.BoxGeometry(legSize + 10, 20, legSize + 10);
      const base = new THREE.Mesh(baseGeo, chromeMat);
      base.position.set(x, -300, z);
      scene.add(base);
    };
    createLeg(WALL_THICKNESS, WALL_THICKNESS);
    createLeg(TABLE_WIDTH - WALL_THICKNESS, WALL_THICKNESS);
    createLeg(WALL_THICKNESS, TABLE_HEIGHT - WALL_THICKNESS);
    createLeg(TABLE_WIDTH - WALL_THICKNESS, TABLE_HEIGHT - WALL_THICKNESS);

    // Balls
    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    physicsBalls.forEach(body => {
      const isCue = body.label === 'cueBall';
      const config = (body as any).config;
      const mat = new THREE.MeshStandardMaterial({ 
        map: createBallTexture(config, isCue),
        roughness: 0.1,
        metalness: 0.1
      });
      const mesh = new THREE.Mesh(ballGeo, mat);
      mesh.castShadow = true;
      scene.add(mesh);
      balls3D.current.set(body.id, mesh);
    });

    // Cue Stick
    const cueGroup = new THREE.Group();
    const cueStickGeo = new THREE.CylinderGeometry(2, 4, 400, 16);
    cueStickGeo.rotateX(Math.PI / 2);
    cueStickGeo.translate(0, 0, -210);
    const cueStickMat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8 });
    const cueStick = new THREE.Mesh(cueStickGeo, cueStickMat);
    cueGroup.add(cueStick);
    scene.add(cueGroup);
    cueRef.current = cueGroup;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
  };

  useEffect(() => {
    const { engine, cueBall, balls } = initPhysics();
    initThree(balls);

    const animate = () => {
      Matter.Engine.update(engine, 1000 / 60);
      
      let moving = false;
      balls.forEach(body => {
        const mesh = balls3D.current.get(body.id);
        if (mesh) {
          mesh.position.set(body.position.x, BALL_RADIUS, body.position.y);
          
          if (body.speed > 0.1) {
            moving = true;
            const axis = new THREE.Vector3(body.velocity.y, 0, -body.velocity.x).normalize();
            const angle = body.speed / BALL_RADIUS;
            mesh.rotateOnWorldAxis(axis, angle);
          }
        }

        const pockets = [
            {x:0, y:0}, {x:TABLE_WIDTH/2, y:0}, {x:TABLE_WIDTH, y:0},
            {x:0, y:TABLE_HEIGHT}, {x:TABLE_WIDTH/2, y:TABLE_HEIGHT}, {x:TABLE_WIDTH, y:TABLE_HEIGHT}
        ];
        pockets.forEach(p => {
            const dx = body.position.x - p.x;
            const dy = body.position.y - p.y;
            if (Math.sqrt(dx*dx + dy*dy) < POCKET_RADIUS) {
                if (body.label === 'cueBall') {
                    Matter.Body.setPosition(body, {x: TABLE_WIDTH*0.25, y: TABLE_HEIGHT/2});
                    Matter.Body.setVelocity(body, {x:0, y:0});
                } else {
                    Matter.Composite.remove(engine.world, body);
                    const m = balls3D.current.get(body.id);
                    if (m) { sceneRef.current?.remove(m); balls3D.current.delete(body.id); }
                    setScore(s => s + 10);
                }
            }
        });
      });

      if (moving !== isMovingRef.current) {
          isMovingRef.current = moving;
          setIsMoving(moving);
      }

      if (cueRef.current && !isMovingRef.current && isAimingRef.current) {
          const cb = cueBall.position;
          const dx = cb.x - mousePos.current.x;
          const dy = cb.y - mousePos.current.y;
          const angle = Math.atan2(dy, dx);
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          cueRef.current.position.set(cb.x, BALL_RADIUS, cb.y);
          cueRef.current.rotation.y = -angle + Math.PI/2;
          cueRef.current.position.x -= Math.cos(angle) * (dist * 0.1);
          cueRef.current.position.z -= Math.sin(angle) * (dist * 0.1);
          cueRef.current.visible = true;
      } else if (cueRef.current) {
          cueRef.current.visible = false;
      }

      rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
      requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!rendererRef.current) return;
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * 2 - 1;
        const y = -(e.clientY - rect.top) / rect.height * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current!);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, target)) {
            mousePos.current = { x: target.x, y: target.z };
        }
    };

    const handleMouseDown = () => { if (!isMovingRef.current) isAimingRef.current = true; };
    const handleMouseUp = () => {
        if (isAimingRef.current) {
            const dx = cueBall.position.x - mousePos.current.x;
            const dy = cueBall.position.y - mousePos.current.y;
            const angle = Math.atan2(dy, dx);
            const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 250);
            
            Matter.Body.applyForce(cueBall, cueBall.position, {
                x: Math.cos(angle) * dist * 0.0015,
                y: Math.sin(angle) * dist * 0.0015
            });
            isAimingRef.current = false;
        }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    
    animate();

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
        rendererRef.current?.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
      <div ref={containerRef} className="absolute inset-0" />
      
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-8 items-center z-20">
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest opacity-50">Score</span>
            <span className="text-2xl font-mono font-bold text-white">{score.toString().padStart(4, '0')}</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest opacity-50">Status</span>
            <span className={`text-xs font-bold uppercase ${isMoving ? 'text-amber-500' : 'text-emerald-400'}`}>
              {isMoving ? 'Rolling...' : 'Ready'}
            </span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-8 text-white/20 text-[10px] font-black uppercase tracking-[0.3em]">
        Full 3D Real-Time Physics Engine
      </div>
    </div>
  );
};

export default PoolGame;
