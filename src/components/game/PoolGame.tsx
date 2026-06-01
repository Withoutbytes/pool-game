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
  
  // Sounds
  const hitSound = useRef<HTMLAudioElement | null>(null);
  const pocketSound = useRef<HTMLAudioElement | null>(null);

  const [score, setScore] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const isMovingRef = useRef(false);
  const isAimingRef = useRef(false);
  const mousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    hitSound.current = new Audio('/assets/sounds/hit.mp3');
    pocketSound.current = new Audio('/assets/sounds/pocket.mp3');
  }, []);

  const playSound = (sound: HTMLAudioElement | null, volume = 0.5) => {
    if (sound) {
      const s = sound.cloneNode() as HTMLAudioElement;
      s.volume = volume;
      s.play().catch(() => {});
    }
  };

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

    Matter.Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const speed = pair.collision.depth * 5;
        if (speed > 0.1) playSound(hitSound.current, Math.min(speed, 1));
      });
    });

    Matter.Composite.add(engine.world, [...walls, ...balls]);
    engineRef.current = engine;
    return { engine, cueBall, balls };
  };

  const createBallTexture = (config: typeof ballConfigs[0] | undefined, isCue: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = isCue ? '#ffffff' : (config?.c || '#eeeeee');
    ctx.fillRect(0, 0, 256, 128);
    if (config?.s) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 64, 128); ctx.fillRect(192, 0, 64, 128);
    }
    if (!isCue && config) {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(128, 64, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000000'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(config.n.toString(), 128, 64);
    }
    return new THREE.CanvasTexture(canvas);
  };

  const initThree = (physicsBalls: Matter.Body[]) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.Fog(0x050505, 1000, 3000);
    
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(TABLE_WIDTH / 2, 700, TABLE_HEIGHT / 2 + 700);
    camera.lookAt(TABLE_WIDTH / 2, -100, TABLE_HEIGHT / 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current?.appendChild(renderer.domElement);

    const texLoader = new THREE.TextureLoader();
    const feltTex = texLoader.load('/assets/textures/felt.jpg');
    feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping; feltTex.repeat.set(4, 2);
    const woodTex = texLoader.load('/assets/textures/wood.jpg');
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    const wallTex = texLoader.load('/assets/textures/wall.jpg');
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(5, 3);
    const floorTex = texLoader.load('/assets/textures/floor.jpg');
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(10, 10);

    // Environment/Room
    // Floor
    const floorGeo = new THREE.PlaneGeometry(10000, 10000);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x333333, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -310;
    floor.receiveShadow = true;
    scene.add(floor);

    // Walls
    const wallGeo = new THREE.PlaneGeometry(10000, 4000);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0x222222, roughness: 1 });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(TABLE_WIDTH/2, 1000, -1000);
    scene.add(backWall);

    // Modern Pub Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const tableLight = new THREE.SpotLight(0xffffff, 3);
    tableLight.position.set(TABLE_WIDTH / 2, 600, TABLE_HEIGHT / 2);
    tableLight.target.position.set(TABLE_WIDTH / 2, 0, TABLE_HEIGHT / 2);
    tableLight.angle = Math.PI / 3;
    tableLight.penumbra = 0.3;
    tableLight.castShadow = true;
    tableLight.shadow.mapSize.width = 2048;
    tableLight.shadow.mapSize.height = 2048;
    scene.add(tableLight);
    scene.add(tableLight.target);

    // Warm accent lights
    const accent1 = new THREE.PointLight(0xffaa44, 2, 1500);
    accent1.position.set(-500, 300, -200);
    scene.add(accent1);
    const accent2 = new THREE.PointLight(0xffaa44, 2, 1500);
    accent2.position.set(TABLE_WIDTH + 500, 300, -200);
    scene.add(accent2);

    // Table Materials
    const feltMat = new THREE.MeshStandardMaterial({ map: feltTex, color: 0x1a4a1a, roughness: 0.9, metalness: 0.05 });
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x3e2723, roughness: 0.6, metalness: 0.1 });

    // Table Construction
    const tableGeo = new THREE.BoxGeometry(TABLE_WIDTH, 12, TABLE_HEIGHT);
    const table = new THREE.Mesh(tableGeo, feltMat);
    table.position.set(TABLE_WIDTH / 2, -6, TABLE_HEIGHT / 2);
    table.receiveShadow = true;
    scene.add(table);

    const createRail = (x: number, y: number, z: number, w: number, h: number, d: number) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, woodMat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
    };
    createRail(TABLE_WIDTH / 2, 10, -WALL_THICKNESS / 2, TABLE_WIDTH + WALL_THICKNESS * 2, 30, WALL_THICKNESS);
    createRail(TABLE_WIDTH / 2, 10, TABLE_HEIGHT + WALL_THICKNESS / 2, TABLE_WIDTH + WALL_THICKNESS * 2, 30, WALL_THICKNESS);
    createRail(-WALL_THICKNESS / 2, 10, TABLE_HEIGHT / 2, WALL_THICKNESS, 30, TABLE_HEIGHT);
    createRail(TABLE_WIDTH + WALL_THICKNESS / 2, 10, TABLE_HEIGHT / 2, WALL_THICKNESS, 30, TABLE_HEIGHT);

    // Visible Pockets
    const pocketGeo = new THREE.CylinderGeometry(POCKET_RADIUS, POCKET_RADIUS, 10, 32);
    const pocketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const pocketsPos = [
        {x:0, y:0}, {x:TABLE_WIDTH/2, y:0}, {x:TABLE_WIDTH, y:0},
        {x:0, y:TABLE_HEIGHT}, {x:TABLE_WIDTH/2, y:TABLE_HEIGHT}, {x:TABLE_WIDTH, y:TABLE_HEIGHT}
    ];
    pocketsPos.forEach(p => {
        const mesh = new THREE.Mesh(pocketGeo, pocketMat);
        mesh.position.set(p.x, -2, p.y);
        scene.add(mesh);
    });

    // Thick Square Legs
    const legSize = 70;
    const legGeo = new THREE.BoxGeometry(legSize, 300, legSize);
    const createLeg = (x: number, z: number) => {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(x, -155, z);
      leg.castShadow = true;
      scene.add(leg);
    };
    createLeg(30, 30); createLeg(TABLE_WIDTH - 30, 30);
    createLeg(30, TABLE_HEIGHT - 30); createLeg(TABLE_WIDTH - 30, TABLE_HEIGHT - 30);

    // Balls
    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    physicsBalls.forEach(body => {
      const mat = new THREE.MeshStandardMaterial({ map: createBallTexture((body as any).config, body.label === 'cueBall'), roughness: 0.1, metalness: 0.1 });
      const mesh = new THREE.Mesh(ballGeo, mat);
      mesh.castShadow = true;
      scene.add(mesh);
      balls3D.current.set(body.id, mesh);
    });

    // Cue Stick
    const cueGroup = new THREE.Group();
    const cueStickGeo = new THREE.CylinderGeometry(2, 5, 450, 16);
    cueStickGeo.rotateX(Math.PI / 2); cueStickGeo.translate(0, 0, -240);
    const cueStickMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xd7ccc8 });
    const cueStick = new THREE.Mesh(cueStickGeo, cueStickMat);
    cueGroup.add(cueStick);
    scene.add(cueGroup);
    cueRef.current = cueGroup;

    sceneRef.current = scene; cameraRef.current = camera; rendererRef.current = renderer;
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
            mesh.rotateOnWorldAxis(axis, body.speed / BALL_RADIUS);
          }
        }
        const pockets = [
            {x:0, y:0}, {x:TABLE_WIDTH/2, y:0}, {x:TABLE_WIDTH, y:0},
            {x:0, y:TABLE_HEIGHT}, {x:TABLE_WIDTH/2, y:TABLE_HEIGHT}, {x:TABLE_WIDTH, y:TABLE_HEIGHT}
        ];
        pockets.forEach(p => {
            const d = Math.sqrt((body.position.x-p.x)**2 + (body.position.y-p.y)**2);
            if (d < POCKET_RADIUS) {
                if (body.label === 'cueBall') {
                    if (body.speed > 0.5) {
                        Matter.Body.setPosition(body, {x: TABLE_WIDTH*0.25, y: TABLE_HEIGHT/2});
                        Matter.Body.setVelocity(body, {x:0, y:0});
                        playSound(pocketSound.current, 0.7);
                    }
                } else if (balls3D.current.has(body.id)) {
                    const m = balls3D.current.get(body.id);
                    if (m) { sceneRef.current?.remove(m); balls3D.current.delete(body.id); Matter.Composite.remove(engine.world, body); setScore(s => s + 10); playSound(pocketSound.current, 0.7); }
                }
            }
        });
      });
      if (moving !== isMovingRef.current) { isMovingRef.current = moving; setIsMoving(moving); }
      if (cueRef.current && !isMovingRef.current && isAimingRef.current) {
          const cb = cueBall.position;
          const dx = cb.x - mousePos.current.x, dy = cb.y - mousePos.current.y;
          const angle = Math.atan2(dy, dx), dist = Math.sqrt(dx*dx + dy*dy);
          cueRef.current.position.set(cb.x, BALL_RADIUS, cb.y);
          cueRef.current.rotation.y = -angle + Math.PI/2;
          cueRef.current.position.x -= Math.cos(angle) * (dist * 0.1);
          cueRef.current.position.z -= Math.sin(angle) * (dist * 0.1);
          cueRef.current.visible = true;
      } else if (cueRef.current) cueRef.current.visible = false;
      rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
      requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!rendererRef.current) return;
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * 2 - 1, y = -(e.clientY - rect.top) / rect.height * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current!);
        const target = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), target)) mousePos.current = { x: target.x, y: target.z };
    };

    const handleMouseDown = () => { if (!isMovingRef.current) isAimingRef.current = true; };
    const handleMouseUp = () => {
        if (isAimingRef.current) {
            const dx = cueBall.position.x - mousePos.current.x, dy = cueBall.position.y - mousePos.current.y;
            const angle = Math.atan2(dy, dx), dist = Math.min(Math.sqrt(dx*dx + dy*dy), 250);
            Matter.Body.applyForce(cueBall, cueBall.position, { x: Math.cos(angle) * dist * 0.0015, y: Math.sin(angle) * dist * 0.0015 });
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
            <span className={`text-xs font-bold uppercase ${isMoving ? 'text-amber-500' : 'text-emerald-400'}`}>{isMoving ? 'Rolling...' : 'Ready'}</span>
          </div>
        </div>
      </div>
      <div className="absolute bottom-8 left-8 text-white/20 text-[10px] font-black uppercase tracking-[0.3em]">Full 3D Real-Time Physics Engine</div>
    </div>
  );
};

export default PoolGame;
