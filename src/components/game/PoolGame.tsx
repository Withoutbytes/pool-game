'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Matter from 'matter-js';
import * as THREE from 'three';
import Ably from 'ably';

// Constants
const TABLE_WIDTH = 800;
const TABLE_HEIGHT = 400;
const BALL_RADIUS = 10;
const WALL_THICKNESS = 40;
const POCKET_RADIUS = 18;

const ABLY_KEY = 'w9w0hQ.SielQA:rM9oV-3hJtQChQuhDngQa-TuNexXDlVcd6n82GcvDCA';

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
  const cueBallRef = useRef<Matter.Body | null>(null);
  const ballsRef = useRef<Matter.Body[]>([]);
  
  // Ably Refs
  const ablyRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const clientId = useRef(`player-${Math.random().toString(36).substr(2, 9)}`);

  // Sounds
  const hitSound = useRef<HTMLAudioElement | null>(null);
  const pocketSound = useRef<HTMLAudioElement | null>(null);

  const [gameState, setGameState] = useState<'menu' | 'playing'>('menu');
  const [gameMode, setGameMode] = useState<'offline' | 'online'>('offline');
  const [roomId, setRoomId] = useState('');
  const [role, setRole] = useState<'host' | 'client'>('host');
  const [score, setScore] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const isMovingRef = useRef(false);
  const isAimingRef = useRef(false);
  const mousePos = useRef({ x: 0, y: 0 });
  const [isMyTurn, setIsMyTurn] = useState(true);

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
    const createWall = (x: number, y: number, w: number, h: number) => Matter.Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0, restitution: 0.8 });
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
    cueBallRef.current = cueBall;
    balls.push(cueBall);

    const startX = TABLE_WIDTH * 0.7;
    const startY = TABLE_HEIGHT / 2;
    let ballIdx = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const x = startX + row * (BALL_RADIUS * 1.75);
        const y = startY + (col - row / 2) * (BALL_RADIUS * 2.1);
        const ball = Matter.Bodies.circle(x, y, BALL_RADIUS, { restitution: 0.95, friction: 0.001, frictionAir: 0.012, mass: 3, label: 'ball' });
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
    ballsRef.current = balls;
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
    scene.background = new THREE.Color(0x222222);
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(TABLE_WIDTH / 2, 750, TABLE_HEIGHT / 2 + 650);
    camera.lookAt(TABLE_WIDTH / 2, -50, TABLE_HEIGHT / 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    const floorGeo = new THREE.PlaneGeometry(10000, 10000);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x666666, roughness: 0.7 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -310; floor.receiveShadow = true;
    scene.add(floor);

    const wallGeo = new THREE.PlaneGeometry(10000, 4000);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0x444444, roughness: 1 });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(TABLE_WIDTH/2, 1000, -1000);
    scene.add(backWall);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const tableLight = new THREE.SpotLight(0xffffff, 4.0);
    tableLight.position.set(TABLE_WIDTH / 2, 700, TABLE_HEIGHT / 2);
    tableLight.angle = Math.PI / 2.5; tableLight.penumbra = 0.2; tableLight.castShadow = true;
    tableLight.shadow.mapSize.width = 4096; tableLight.shadow.mapSize.height = 4096;
    scene.add(tableLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
    frontLight.position.set(TABLE_WIDTH / 2, 500, 1000);
    scene.add(frontLight);

    const feltMat = new THREE.MeshStandardMaterial({ map: feltTex, color: 0x388e3c, roughness: 0.8, metalness: 0.05 });
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x5d4037, roughness: 0.5, metalness: 0.1 });

    const tableGeo = new THREE.BoxGeometry(TABLE_WIDTH, 12, TABLE_HEIGHT);
    const table = new THREE.Mesh(tableGeo, feltMat);
    table.position.set(TABLE_WIDTH / 2, -6, TABLE_HEIGHT / 2); table.receiveShadow = true;
    scene.add(table);

    const createRail = (x: number, y: number, z: number, w: number, h: number, d: number) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, woodMat);
        mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
    };
    createRail(TABLE_WIDTH / 2, 10, -WALL_THICKNESS / 2, TABLE_WIDTH + WALL_THICKNESS * 2, 30, WALL_THICKNESS);
    createRail(TABLE_WIDTH / 2, 10, TABLE_HEIGHT + WALL_THICKNESS / 2, TABLE_WIDTH + WALL_THICKNESS * 2, 30, WALL_THICKNESS);
    createRail(-WALL_THICKNESS / 2, 10, TABLE_HEIGHT / 2, WALL_THICKNESS, 30, TABLE_HEIGHT);
    createRail(TABLE_WIDTH + WALL_THICKNESS / 2, 10, TABLE_HEIGHT / 2, WALL_THICKNESS, 30, TABLE_HEIGHT);

    const pocketsPos = [ {x:0, y:0}, {x:TABLE_WIDTH/2, y:0}, {x:TABLE_WIDTH, y:0}, {x:0, y:TABLE_HEIGHT}, {x:TABLE_WIDTH/2, y:TABLE_HEIGHT}, {x:TABLE_WIDTH, y:TABLE_HEIGHT} ];
    pocketsPos.forEach(p => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(POCKET_RADIUS, POCKET_RADIUS, 10, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        mesh.position.set(p.x, -2, p.y); scene.add(mesh);
    });

    const legSize = 75; const legGeo = new THREE.BoxGeometry(legSize, 300, legSize);
    const createLeg = (x: number, z: number) => {
      const leg = new THREE.Mesh(legGeo, woodMat); leg.position.set(x, -155, z); leg.castShadow = true; scene.add(leg);
    };
    createLeg(30, 30); createLeg(TABLE_WIDTH - 30, 30); createLeg(30, TABLE_HEIGHT - 30); createLeg(TABLE_WIDTH - 30, TABLE_HEIGHT - 30);

    physicsBalls.forEach(body => {
      const mat = new THREE.MeshStandardMaterial({ map: createBallTexture((body as any).config, body.label === 'cueBall'), roughness: 0.1, metalness: 0.1 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 32), mat);
      mesh.castShadow = true; scene.add(mesh);
      balls3D.current.set(body.id, mesh);
    });

    const cueGroup = new THREE.Group();
    const cueStickGeo = new THREE.CylinderGeometry(2, 5, 450, 16);
    cueStickGeo.rotateX(Math.PI / 2); cueStickGeo.translate(0, 0, -240);
    const cueStick = new THREE.Mesh(cueStickGeo, new THREE.MeshStandardMaterial({ map: woodTex, color: 0xffffff }));
    cueGroup.add(cueStick); scene.add(cueGroup); cueRef.current = cueGroup;

    sceneRef.current = scene; cameraRef.current = camera; rendererRef.current = renderer;
  };

  const handleShot = useCallback((angle: number, force: number) => {
    if (!cueBallRef.current || isMovingRef.current) return;
    
    const apply = (a: number, f: number) => {
      Matter.Body.applyForce(cueBallRef.current!, cueBallRef.current!.position, {
        x: Math.cos(a) * f * 0.0015,
        y: Math.sin(a) * f * 0.0015
      });
      setIsMyTurn(prev => !prev);
    };

    apply(angle, force);

    if (gameMode === 'online' && channelRef.current) {
      channelRef.current.publish('shot', { angle, force, clientId: clientId.current });
    }
  }, [gameMode]);

  const syncBallePositions = (positions: any) => {
    if (!engineRef.current) return;
    positions.forEach((pos: any) => {
      const ball = ballsRef.current.find(b => b.id === pos.id);
      if (ball) {
        Matter.Body.setPosition(ball, { x: pos.x, y: pos.y });
        Matter.Body.setVelocity(ball, { x: pos.vx, y: pos.vy });
      }
    });
  };

  useEffect(() => {
    if (gameState !== 'playing') return;

    const { engine, cueBall, balls } = initPhysics();
    initThree(balls);

    if (gameMode === 'online' && roomId) {
      ablyRef.current = new Ably.Realtime({ key: ABLY_KEY, clientId: clientId.current });
      channelRef.current = ablyRef.current.channels.get(`pool-${roomId}`);
      
      channelRef.current.subscribe('shot', (message) => {
        if (message.clientId !== clientId.current) {
          const { angle, force } = message.data;
          Matter.Body.applyForce(cueBall, cueBall.position, {
            x: Math.cos(angle) * force * 0.0015,
            y: Math.sin(angle) * force * 0.0015
          });
          setIsMyTurn(true);
        }
      });

      channelRef.current.subscribe('sync', (message) => {
        if (role === 'client') syncBallePositions(message.data.balls);
      });
    }

    const animate = () => {
      Matter.Engine.update(engine, 1000 / 60);
      let moving = false;
      ballsRef.current.forEach(body => {
        const mesh = balls3D.current.get(body.id);
        if (mesh) {
          mesh.position.set(body.position.x, BALL_RADIUS, body.position.y);
          if (body.speed > 0.1) {
            moving = true;
            const axis = new THREE.Vector3(body.velocity.y, 0, -body.velocity.x).normalize();
            mesh.rotateOnWorldAxis(axis, body.speed / BALL_RADIUS);
          }
        }
        const pockets = [ {x:0, y:0}, {x:TABLE_WIDTH/2, y:0}, {x:TABLE_WIDTH, y:0}, {x:0, y:TABLE_HEIGHT}, {x:TABLE_WIDTH/2, y:TABLE_HEIGHT}, {x:TABLE_WIDTH, y:TABLE_HEIGHT} ];
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

      if (moving !== isMovingRef.current) {
        isMovingRef.current = moving;
        setIsMoving(moving);
        // Sync final positions when balls stop
        if (!moving && gameMode === 'online' && role === 'host' && channelRef.current) {
          const positions = ballsRef.current.map(b => ({ id: b.id, x: b.position.x, y: b.position.y, vx: b.velocity.x, vy: b.velocity.y }));
          channelRef.current.publish('sync', { balls: positions });
        }
      }

      if (cueRef.current && !isMovingRef.current && isAimingRef.current && isMyTurn) {
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

    const handleMouseDown = () => { if (!isMovingRef.current && isMyTurn) isAimingRef.current = true; };
    const handleMouseUp = () => {
        if (isAimingRef.current) {
            const dx = cueBall.position.x - mousePos.current.x, dy = cueBall.position.y - mousePos.current.y;
            const angle = Math.atan2(dy, dx), dist = Math.min(Math.sqrt(dx*dx + dy*dy), 250);
            handleShot(angle, dist);
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
        if (channelRef.current) channelRef.current.unsubscribe();
        if (ablyRef.current) ablyRef.current.close();
    };
  }, [gameState, gameMode, roomId, role, isMyTurn, handleShot]);

  if (gameState === 'menu') {
    return (
      <div className="w-full h-screen bg-[#111] flex items-center justify-center font-sans text-white">
        <div className="bg-zinc-900 p-12 rounded-3xl border border-white/10 shadow-2xl flex flex-col gap-8 w-[400px]">
          <h1 className="text-4xl font-black italic tracking-tighter text-center bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">8-BALL 3D</h1>
          
          <button onClick={() => { setGameMode('offline'); setGameState('playing'); }} 
            className="bg-white/5 hover:bg-white/10 border border-white/10 p-6 rounded-2xl transition-all group">
            <h2 className="text-xl font-bold">Modo Offline</h2>
            <p className="text-xs text-white/40 mt-1">Jogue sozinho para treinar</p>
          </button>

          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-black text-emerald-500 uppercase tracking-widest text-center">Multiplayer</h2>
            <input 
              type="text" placeholder="Código da Sala" value={roomId} onChange={(e) => setRoomId(e.target.value)}
              className="bg-black/50 border border-white/10 p-4 rounded-xl text-center font-mono text-xl focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { if(!roomId) return; setGameMode('online'); setRole('host'); setGameState('playing'); }}
                className="bg-emerald-500 hover:bg-emerald-600 p-4 rounded-xl font-bold transition-all disabled:opacity-50">Criar Sala</button>
              <button onClick={() => { if(!roomId) return; setGameMode('online'); setRole('client'); setGameState('playing'); }}
                className="bg-cyan-500 hover:bg-cyan-600 p-4 rounded-xl font-bold transition-all disabled:opacity-50">Entrar</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest opacity-50">Turno</span>
            <span className={`text-xs font-bold uppercase ${isMyTurn ? 'text-emerald-400' : 'text-amber-500'}`}>{isMyTurn ? 'Sua Vez' : 'Oponente'}</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest opacity-50">Sala</span>
            <span className="text-xs font-bold uppercase text-white">{gameMode === 'online' ? roomId : 'LOCAL'}</span>
          </div>
        </div>
      </div>
      <button onClick={() => { setGameState('menu'); if(ablyRef.current) ablyRef.current.close(); }} className="absolute bottom-8 right-8 bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-3 rounded-xl text-white font-bold text-xs uppercase transition-all z-20">Sair do Jogo</button>
      <div className="absolute bottom-8 left-8 text-white/20 text-[10px] font-black uppercase tracking-[0.3em]">Full 3D Real-Time Physics Engine</div>
    </div>
  );
};

export default PoolGame;
