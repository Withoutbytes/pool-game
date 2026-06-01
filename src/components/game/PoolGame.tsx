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
  const lobbyChannelRef = useRef<Ably.RealtimeChannel | null>(null);
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
  
  // Lobby State
  const [publicRooms, setPublicRooms] = useState<Array<{ id: string, players: number }>>([]);

  useEffect(() => {
    hitSound.current = new Audio('/assets/sounds/hit.mp3');
    pocketSound.current = new Audio('/assets/sounds/pocket.mp3');

    // Initialize Lobby Discovery
    const ably = new Ably.Realtime({ key: ABLY_KEY, clientId: clientId.current });
    const lobby = ably.channels.get('pool-lobby');
    lobbyChannelRef.current = lobby;

    // Listen for room updates
    lobby.subscribe('room-update', (msg) => {
        setPublicRooms(prev => {
            const filtered = prev.filter(r => r.id !== msg.data.id);
            if (msg.data.players > 0) {
                return [...filtered, msg.data].sort((a, b) => b.players - a.players);
            }
            return filtered;
        });
    });

    // Request initial list
    lobby.publish('get-rooms', {});

    return () => {
        lobby.unsubscribe();
        ably.close();
    };
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
    scene.background = new THREE.Color(0x1a1a1a);
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
    createLeg(30, 30); createLeg(TABLE_WIDTH - 30, 30);
    createLeg(30, TABLE_HEIGHT - 30); createLeg(TABLE_WIDTH - 30, TABLE_HEIGHT - 30);

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
      Matter.Body.applyForce(cueBallRef.current!, cueBallRef.current!.position, { x: Math.cos(a) * f * 0.0015, y: Math.sin(a) * f * 0.0015 });
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
      
      // Update presence in lobby
      channelRef.current.presence.enter();
      channelRef.current.presence.subscribe(() => {
        channelRef.current?.presence.get((err, members) => {
            if (!err && lobbyChannelRef.current) {
                lobbyChannelRef.current.publish('room-update', { id: roomId, players: members?.length || 0 });
            }
        });
      });

      channelRef.current.subscribe('shot', (message) => {
        if (message.clientId !== clientId.current) {
          const { angle, force } = message.data;
          Matter.Body.applyForce(cueBall, cueBall.position, { x: Math.cos(angle) * force * 0.0015, y: Math.sin(angle) * force * 0.0015 });
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
        if (channelRef.current) {
            channelRef.current.presence.leave();
            channelRef.current.unsubscribe();
        }
        if (ablyRef.current) ablyRef.current.close();
    };
  }, [gameState, gameMode, roomId, role, isMyTurn, handleShot]);

  if (gameState === 'menu') {
    return (
      <div className="w-full h-screen bg-[#0a0a0a] flex items-center justify-center font-sans text-white overflow-hidden relative">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
        
        <div className="relative z-10 flex flex-col md:flex-row gap-8 w-full max-w-6xl px-8 h-[600px]">
          {/* Main Controls */}
          <div className="flex-1 bg-zinc-900/50 backdrop-blur-3xl border border-white/5 p-10 rounded-[40px] shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                   <div className="w-3 h-3 bg-white rounded-full" />
                </div>
                <span className="text-emerald-500 font-black uppercase tracking-[0.3em] text-[10px]">Real-Time 3D</span>
              </div>
              <h1 className="text-7xl font-black italic tracking-tighter leading-none mb-8">
                8-BALL <br /> <span className="bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent underline decoration-emerald-500/50 underline-offset-8">ONLINE</span>
              </h1>
              
              <button onClick={() => { setGameMode('offline'); setGameState('playing'); }} 
                className="w-full group relative bg-white/[0.03] hover:bg-emerald-500 border border-white/5 hover:border-emerald-400 p-8 rounded-3xl transition-all duration-500 text-left overflow-hidden">
                <div className="absolute right-[-20px] bottom-[-20px] opacity-10 group-hover:opacity-20 transition-opacity">
                    <div className="w-32 h-32 border-8 border-white rounded-full" />
                </div>
                <h2 className="text-3xl font-black italic group-hover:translate-x-2 transition-transform duration-500">PRATICAR</h2>
                <p className="text-sm text-white/40 group-hover:text-white/80 group-hover:translate-x-2 transition-all duration-500 delay-75">Modo offline com física autoritativa</p>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="flex items-center gap-4">
                <input 
                  type="text" placeholder="NOME DA SALA..." value={roomId} onChange={(e) => setRoomId(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/5 p-6 rounded-2xl text-center font-black text-xl placeholder:text-white/10 focus:outline-none focus:border-emerald-500/50 focus:bg-black/60 transition-all uppercase tracking-wider"
                />
                <button onClick={() => { if(!roomId) return; setGameMode('online'); setRole('host'); setGameState('playing'); }}
                  disabled={!roomId}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-20 disabled:grayscale px-10 rounded-2xl font-black text-black transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)] active:scale-95 h-[72px]">
                  CRIAR
                </button>
              </div>
            </div>
          </div>

          {/* Public Rooms List */}
          <div className="w-full md:w-[380px] bg-black/40 backdrop-blur-2xl border border-white/5 rounded-[40px] flex flex-col overflow-hidden">
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h3 className="font-black text-sm uppercase tracking-widest text-white/60 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                    Salas Públicas
                </h3>
                <span className="text-[10px] font-bold bg-white/10 px-2 py-1 rounded-md text-white/40">{publicRooms.length} ATIVAS</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
                {publicRooms.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-20">
                        <div className="w-12 h-12 border-2 border-dashed border-white rounded-full mb-4 animate-spin-slow" />
                        <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">Nenhuma sala encontrada<br/>Crie a sua agora!</p>
                    </div>
                ) : (
                    publicRooms.map(room => (
                        <button key={room.id} 
                            onClick={() => { setRoomId(room.id); setRole('client'); setGameMode('online'); setGameState('playing'); }}
                            className="w-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 p-5 rounded-2xl flex items-center justify-between group transition-all">
                            <div className="text-left">
                                <p className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-1">Sala</p>
                                <p className="font-bold text-lg truncate w-[180px]">{room.id}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex gap-1">
                                    {[...Array(room.players)].map((_, i) => <div key={i} className="w-2 h-2 bg-emerald-500 rounded-full" />)}
                                    {[...Array(2 - room.players)].map((_, i) => <div key={i} className="w-2 h-2 bg-white/10 rounded-full" />)}
                                </div>
                                <span className="text-[10px] font-black group-hover:text-emerald-400 transition-colors uppercase tracking-widest">ENTRAR →</span>
                            </div>
                        </button>
                    ))
                )}
            </div>
            
            <div className="p-6 bg-white/[0.02] border-t border-white/5">
                <p className="text-[9px] text-center font-bold text-white/20 uppercase tracking-[0.2em]">Servidores Ably Global Latency: ~20ms</p>
            </div>
          </div>
        </div>
        
        <style jsx global>{`
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .animate-spin-slow { animation: spin-slow 8s linear infinite; }
        `}</style>
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
          <div className="flex flex-col text-center min-w-[80px]">
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest opacity-50">Turno</span>
            <span className={`text-xs font-bold uppercase ${isMyTurn ? 'text-emerald-400' : 'text-amber-500'}`}>{isMyTurn ? 'Sua Vez' : 'Oponente'}</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col text-center">
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest opacity-50">Sala</span>
            <span className="text-xs font-bold uppercase text-white truncate max-w-[100px]">{gameMode === 'online' ? roomId : 'LOCAL'}</span>
          </div>
        </div>
      </div>
      <button onClick={() => { setGameState('menu'); if(ablyRef.current) ablyRef.current.close(); }} 
        className="absolute bottom-8 right-8 bg-zinc-900/80 backdrop-blur-md hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 px-8 py-4 rounded-2xl text-white font-black text-xs uppercase tracking-widest transition-all z-20 active:scale-95">
        Sair do Jogo
      </button>
      <div className="absolute bottom-8 left-8 text-white/20 text-[10px] font-black uppercase tracking-[0.3em]">Full 3D Real-Time Physics Engine</div>
    </div>
  );
};

export default PoolGame;
