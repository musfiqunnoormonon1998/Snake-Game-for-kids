/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Trophy, 
  RotateCcw, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Flame, 
  Sparkles, 
  Gamepad2, 
  ShieldAlert, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  Code2,
  Copy,
  Check,
  Download,
  Info,
  X
} from 'lucide-react';
import { sounds } from './sound';

// Grid configurations
const GRID_SIZE = 20; // 20x20 grid
const CANVAS_PIXELS = 400; // 400x400 display
const CELL_SIZE = CANVAS_PIXELS / GRID_SIZE; // 20px per cell

type Direction = { x: number; y: number };
type Point = { x: number; y: number };
type GameState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
type Difficulty = 'chill' | 'classic' | 'hyper';
type WallMode = 'classic' | 'portal';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  alpha: number;
  decay: number;
}

interface FloatingScore {
  id: number;
  text: string;
  x: number;
  y: number;
  alpha: number;
  color: string;
}

interface BonusFood extends Point {
  timeLeft: number;
  duration: number;
}

export default function App() {
  // Game states
  const [gameState, setGameState] = useState<GameState>('IDLE');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    const saved = localStorage.getItem('neon_serpent_highscore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [difficulty, setDifficulty] = useState<Difficulty>('classic');
  const [wallMode, setWallMode] = useState<WallMode>('classic');
  const [isMuted, setIsMuted] = useState<boolean>(() => sounds.getMuted());
  const [applesEaten, setApplesEaten] = useState<number>(0);
  const [bonusEaten, setBonusEaten] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // References for game loop execution
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snakeRef = useRef<Point[]>([
    { x: 10, y: 12 },
    { x: 10, y: 13 },
    { x: 10, y: 14 },
  ]);
  const directionRef = useRef<Direction>({ x: 0, y: -1 }); // moving up
  const inputQueueRef = useRef<Direction[]>([]);
  const foodRef = useRef<Point>({ x: 10, y: 6 });
  const bonusFoodRef = useRef<BonusFood | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingScoresRef = useRef<FloatingScore[]>([]);
  
  // Timing and loop references
  const lastTickTimeRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const gameStateRef = useRef<GameState>('IDLE');
  const scoreRef = useRef<number>(0);
  const highScoreRef = useRef<number>(highScore);
  const difficultyRef = useRef<Difficulty>(difficulty);
  const wallModeRef = useRef<WallMode>(wallMode);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    wallModeRef.current = wallMode;
  }, [wallMode]);

  // Calculate current tick speed based on difficulty and score
  const getTickSpeed = useCallback((): number => {
    const currentScore = scoreRef.current;
    if (difficultyRef.current === 'chill') {
      return 140; // relaxed speed
    } else if (difficultyRef.current === 'hyper') {
      // Rapid pace: starts at 75ms, scales to 40ms
      return Math.max(40, 75 - Math.floor(currentScore / 40) * 4);
    } else {
      // Classic: starts at 110ms, scales gradually to 60ms
      return Math.max(55, 110 - Math.floor(currentScore / 30) * 4);
    }
  }, []);

  // Helper: Find valid empty cell for food
  const getRandomFreeCell = useCallback((): Point => {
    const snake = snakeRef.current;
    const occupied = new Set(snake.map(p => `${p.x},${p.y}`));
    if (bonusFoodRef.current) {
      occupied.add(`${bonusFoodRef.current.x},${bonusFoodRef.current.y}`);
    }

    const freeCells: Point[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (!occupied.has(`${x},${y}`)) {
          freeCells.push({ x, y });
        }
      }
    }

    if (freeCells.length === 0) {
      return { x: 0, y: 0 };
    }
    const idx = Math.floor(Math.random() * freeCells.length);
    return freeCells[idx];
  }, []);

  // Spawn visual particle sparks
  const spawnParticles = useCallback((x: number, y: number, color: string, count: number = 16) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
      const speed = Math.random() * 3 + 1.5;
      particlesRef.current.push({
        x: (x + 0.5) * CELL_SIZE,
        y: (y + 0.5) * CELL_SIZE,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: Math.random() * 2.5 + 1.5,
        alpha: 1.0,
        decay: Math.random() * 0.03 + 0.02
      });
    }
  }, []);

  // Add floating score text (+10, +50)
  const addFloatingScore = useCallback((text: string, x: number, y: number, color: string = '#34d399') => {
    floatingScoresRef.current.push({
      id: Date.now() + Math.random(),
      text,
      x: (x + 0.5) * CELL_SIZE,
      y: (y + 0.3) * CELL_SIZE,
      alpha: 1.0,
      color
    });
  }, []);

  // Queue a directional change safely
  const queueDirection = useCallback((newDir: Direction) => {
    if (gameStateRef.current !== 'PLAYING') return;

    const queue = inputQueueRef.current;
    // Base comparison against either the last queued direction or current direction
    const lastDir = queue.length > 0 ? queue[queue.length - 1] : directionRef.current;

    // Disallow 180-degree instant suicide reversals
    if (newDir.x === -lastDir.x && newDir.y === -lastDir.y) {
      return;
    }

    // Disallow duplicate direction
    if (newDir.x === lastDir.x && newDir.y === lastDir.y) {
      return;
    }

    // Limit buffer to maximum 2 fast queued moves
    if (queue.length < 2) {
      queue.push(newDir);
      sounds.playTurn();
    }
  }, []);

  // Start new game
  const startGame = useCallback(() => {
    // Reset snake in middle moving UP
    const startSnake = [
      { x: 10, y: 12 },
      { x: 10, y: 13 },
      { x: 10, y: 14 }
    ];
    snakeRef.current = startSnake;
    directionRef.current = { x: 0, y: -1 };
    inputQueueRef.current = [];
    particlesRef.current = [];
    floatingScoresRef.current = [];
    bonusFoodRef.current = null;

    setScore(0);
    setApplesEaten(0);
    setBonusEaten(0);
    setIsNewHighScore(false);
    setShake(false);

    // Initial food
    foodRef.current = { x: 10, y: 5 };

    setGameState('PLAYING');
    lastTickTimeRef.current = performance.now();
    sounds.playStart();
  }, []);

  // Toggle Pause
  const togglePause = useCallback(() => {
    setGameState(prev => {
      if (prev === 'PLAYING') {
        sounds.playTurn();
        return 'PAUSED';
      }
      if (prev === 'PAUSED') {
        sounds.playTurn();
        lastTickTimeRef.current = performance.now();
        return 'PLAYING';
      }
      return prev;
    });
  }, []);

  // Trigger game over
  const triggerGameOver = useCallback(() => {
    setGameState('GAMEOVER');
    sounds.playCrash();
    setShake(true);
    setTimeout(() => setShake(false), 350);

    // Spawn explosion particles on snake head
    const head = snakeRef.current[0];
    if (head) {
      spawnParticles(head.x, head.y, '#f43f5e', 28);
    }

    // High Score check
    const currentScore = scoreRef.current;
    if (currentScore > highScoreRef.current) {
      setHighScore(currentScore);
      localStorage.setItem('neon_serpent_highscore', String(currentScore));
      setIsNewHighScore(true);
      setTimeout(() => sounds.playHighScore(), 250);
    }
  }, [spawnParticles]);

  // Main game tick update
  const gameTick = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;

    // Pop queued direction if available
    if (inputQueueRef.current.length > 0) {
      const nextDir = inputQueueRef.current.shift()!;
      // Extra sanity check against 180° turn
      if (!(nextDir.x === -directionRef.current.x && nextDir.y === -directionRef.current.y)) {
        directionRef.current = nextDir;
      }
    }

    const currentSnake = snakeRef.current;
    const currentDir = directionRef.current;
    const head = currentSnake[0];

    // Compute new head coordinates
    let newHeadX = head.x + currentDir.x;
    let newHeadY = head.y + currentDir.y;

    // Wall handling based on mode
    if (wallModeRef.current === 'portal') {
      if (newHeadX < 0) newHeadX = GRID_SIZE - 1;
      else if (newHeadX >= GRID_SIZE) newHeadX = 0;
      if (newHeadY < 0) newHeadY = GRID_SIZE - 1;
      else if (newHeadY >= GRID_SIZE) newHeadY = 0;
    } else {
      // Classic mode: Wall hit = Game Over
      if (newHeadX < 0 || newHeadX >= GRID_SIZE || newHeadY < 0 || newHeadY >= GRID_SIZE) {
        triggerGameOver();
        return;
      }
    }

    // Self-collision check (excluding the tail which will move unless eating food)
    const eatsFood = newHeadX === foodRef.current.x && newHeadY === foodRef.current.y;
    const eatsBonus = bonusFoodRef.current && newHeadX === bonusFoodRef.current.x && newHeadY === bonusFoodRef.current.y;
    
    // For collision, if we don't eat food, the tail will pop off so hitting the very last segment tail isn't a crash
    const segmentsToCheck = (eatsFood || eatsBonus) ? currentSnake : currentSnake.slice(0, -1);
    for (const segment of segmentsToCheck) {
      if (segment.x === newHeadX && segment.y === newHeadY) {
        triggerGameOver();
        return;
      }
    }

    // Create new snake array
    const newHead = { x: newHeadX, y: newHeadY };
    const nextSnake = [newHead, ...currentSnake];

    // Handle Food consumption
    if (eatsFood) {
      sounds.playEat(false);
      spawnParticles(newHeadX, newHeadY, '#10b981', 18);
      addFloatingScore('+10', newHeadX, newHeadY, '#34d399');

      const pointsEarned = 10;
      setScore(prev => prev + pointsEarned);
      setApplesEaten(prev => {
        const updated = prev + 1;
        // Chance to spawn special bonus food every 5 apples
        if (updated % 5 === 0 && !bonusFoodRef.current) {
          const bonusCell = getRandomFreeCell();
          bonusFoodRef.current = {
            x: bonusCell.x,
            y: bonusCell.y,
            timeLeft: 6.0, // 6 seconds to grab it
            duration: 6.0
          };
        }
        return updated;
      });

      // Spawn new normal food
      foodRef.current = getRandomFreeCell();
    } else if (eatsBonus) {
      sounds.playEat(true);
      spawnParticles(newHeadX, newHeadY, '#fbbf24', 24);
      addFloatingScore('+50 BONUS!', newHeadX, newHeadY, '#fbbf24');

      setScore(prev => prev + 50);
      setBonusEaten(prev => prev + 1);
      bonusFoodRef.current = null;
    } else {
      // Normal move: remove tail
      nextSnake.pop();
    }

    snakeRef.current = nextSnake;
  }, [triggerGameOver, getRandomFreeCell, spawnParticles, addFloatingScore]);

  // Main Animation & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI retina screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_PIXELS * dpr;
    canvas.height = CANVAS_PIXELS * dpr;
    ctx.scale(dpr, dpr);

    let lastFrameTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = (currentTime - lastFrameTime) / 1000;
      lastFrameTime = currentTime;

      // 1. Logic Tick if playing
      if (gameStateRef.current === 'PLAYING') {
        const tickInterval = getTickSpeed();
        if (currentTime - lastTickTimeRef.current >= tickInterval) {
          gameTick();
          lastTickTimeRef.current = currentTime;
        }

        // Update bonus food countdown
        if (bonusFoodRef.current) {
          bonusFoodRef.current.timeLeft -= dt;
          if (bonusFoodRef.current.timeLeft <= 0) {
            bonusFoodRef.current = null;
          }
        }
      }

      // 2. Render Frame
      // Clear canvas with deep space tone
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, CANVAS_PIXELS, CANVAS_PIXELS);

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID_SIZE; i++) {
        const pos = i * CELL_SIZE;
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, CANVAS_PIXELS);
        ctx.stroke();

        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(CANVAS_PIXELS, pos);
        ctx.stroke();
      }

      // Draw grid intersection dots for modern cyber look
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      for (let x = 1; x < GRID_SIZE; x++) {
        for (let y = 1; y < GRID_SIZE; y++) {
          ctx.beginPath();
          ctx.arc(x * CELL_SIZE, y * CELL_SIZE, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Portal Mode glowing boundary if in portal mode
      if (wallModeRef.current === 'portal') {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, CANVAS_PIXELS - 2, CANVAS_PIXELS - 2);
      }

      // 3. Draw Normal Food (Glowing Neon Apple)
      const food = foodRef.current;
      const foodPulse = Math.sin(currentTime * 0.007) * 0.15 + 0.85; // smooth pulsation
      const foodCenterX = (food.x + 0.5) * CELL_SIZE;
      const foodCenterY = (food.y + 0.5) * CELL_SIZE;
      const foodRadius = (CELL_SIZE * 0.38) * foodPulse;

      // Glow halo
      ctx.save();
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 16 * foodPulse;
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(foodCenterX, foodCenterY, foodRadius, 0, Math.PI * 2);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.arc(foodCenterX - 2, foodCenterY - 2, foodRadius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Cute stem/leaf
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(foodCenterX, foodCenterY - foodRadius);
      ctx.quadraticCurveTo(foodCenterX + 4, foodCenterY - foodRadius - 4, foodCenterX + 2, foodCenterY - foodRadius - 6);
      ctx.stroke();
      ctx.restore();

      // 4. Draw Bonus Food if active (Golden Starfruit with progress ring)
      if (bonusFoodRef.current) {
        const bonus = bonusFoodRef.current;
        const bX = (bonus.x + 0.5) * CELL_SIZE;
        const bY = (bonus.y + 0.5) * CELL_SIZE;
        const bPulse = Math.sin(currentTime * 0.012) * 0.2 + 0.9;
        const bRadius = (CELL_SIZE * 0.42) * bPulse;

        ctx.save();
        // Golden Glow
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 20;

        // Circular countdown ring
        const progress = bonus.timeLeft / bonus.duration;
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bX, bY, CELL_SIZE * 0.48, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(bX, bY, CELL_SIZE * 0.48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
        ctx.stroke();

        // Bonus Starfruit center
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(bX, bY, bRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(bX - 2, bY - 2, bRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 5. Draw Snake
      const snake = snakeRef.current;
      if (snake.length > 0) {
        // Draw body segments with smooth gradient
        for (let i = snake.length - 1; i >= 0; i--) {
          const seg = snake[i];
          const isHead = i === 0;
          const ratio = 1 - i / snake.length; // 1 at head, 0 at tail

          const segX = seg.x * CELL_SIZE;
          const segY = seg.y * CELL_SIZE;
          const padding = isHead ? 1.5 : 2;
          const cornerRadius = isHead ? 6 : 4;

          ctx.save();
          if (isHead) {
            // Glowing Head
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = 14;

            // Head gradient
            const grad = ctx.createLinearGradient(segX, segY, segX + CELL_SIZE, segY + CELL_SIZE);
            grad.addColorStop(0, '#22d3ee');
            grad.addColorStop(1, '#06b6d4');
            ctx.fillStyle = grad;

            // Rounded head rectangle
            ctx.beginPath();
            ctx.roundRect(segX + padding, segY + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2, cornerRadius);
            ctx.fill();

            // Head Eyes looking in current direction
            const dir = directionRef.current;
            const eyeOffset = 4.5;
            let eye1X = segX + CELL_SIZE / 2;
            let eye1Y = segY + CELL_SIZE / 2;
            let eye2X = segX + CELL_SIZE / 2;
            let eye2Y = segY + CELL_SIZE / 2;

            if (dir.x === 1) { // Right
              eye1X = segX + CELL_SIZE - 5; eye1Y = segY + 6;
              eye2X = segX + CELL_SIZE - 5; eye2Y = segY + CELL_SIZE - 6;
            } else if (dir.x === -1) { // Left
              eye1X = segX + 5; eye1Y = segY + 6;
              eye2X = segX + 5; eye2Y = segY + CELL_SIZE - 6;
            } else if (dir.y === -1) { // Up
              eye1X = segX + 6; eye1Y = segY + 5;
              eye2X = segX + CELL_SIZE - 6; eye2Y = segY + 5;
            } else { // Down
              eye1X = segX + 6; eye1Y = segY + CELL_SIZE - 5;
              eye2X = segX + CELL_SIZE - 6; eye2Y = segY + CELL_SIZE - 5;
            }

            // Eye whites
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(eye1X, eye1Y, 2.2, 0, Math.PI * 2);
            ctx.arc(eye2X, eye2Y, 2.2, 0, Math.PI * 2);
            ctx.fill();

            // Eye pupils
            ctx.fillStyle = '#090d16';
            ctx.beginPath();
            ctx.arc(eye1X + dir.x * 0.7, eye1Y + dir.y * 0.7, 1.2, 0, Math.PI * 2);
            ctx.arc(eye2X + dir.x * 0.7, eye2Y + dir.y * 0.7, 1.2, 0, Math.PI * 2);
            ctx.fill();

          } else {
            // Body segment interpolation (Cyan -> Emerald -> Deep Teal)
            const r = Math.round(6 + (16 - 6) * ratio);
            const g = Math.round(182 + (185 - 182) * ratio);
            const b = Math.round(212 + (129 - 212) * ratio);
            const alpha = 0.5 + 0.5 * ratio;

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.beginPath();
            ctx.roundRect(segX + padding, segY + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2, cornerRadius);
            ctx.fill();

            // Subtle interior highlight
            ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * ratio})`;
            ctx.beginPath();
            ctx.roundRect(segX + padding + 1, segY + padding + 1, (CELL_SIZE - padding * 2) * 0.5, (CELL_SIZE - padding * 2) * 0.5, 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // 6. Draw & Update Particle Sparks
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95; // drag
        p.vy *= 0.95;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 7. Draw & Update Floating Scores
      const floatingScores = floatingScoresRef.current;
      for (let i = floatingScores.length - 1; i >= 0; i--) {
        const fs = floatingScores[i];
        fs.y -= 0.6; // float upward
        fs.alpha -= 0.025; // fade out

        if (fs.alpha <= 0) {
          floatingScores.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = fs.alpha;
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillStyle = fs.color;
        ctx.shadowColor = fs.color;
        ctx.shadowBlur = 8;
        ctx.textAlign = 'center';
        ctx.fillText(fs.text, fs.x, fs.y);
        ctx.restore();
      }

      animationFrameIdRef.current = requestAnimationFrame(loop);
    };

    animationFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [getTickSpeed, gameTick]);

  // Keyboard navigation listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default page scroll on arrow keys and spacebar
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (e.code === 'Space' || e.code === 'KeyP') {
        if (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'PAUSED') {
          togglePause();
        } else if (gameStateRef.current === 'IDLE' || gameStateRef.current === 'GAMEOVER') {
          startGame();
        }
        return;
      }

      // Directional inputs (Arrows + WASD)
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          queueDirection({ x: 0, y: -1 });
          break;
        case 'ArrowDown':
        case 'KeyS':
          queueDirection({ x: 0, y: 1 });
          break;
        case 'ArrowLeft':
        case 'KeyA':
          queueDirection({ x: -1, y: 0 });
          break;
        case 'ArrowRight':
        case 'KeyD':
          queueDirection({ x: 1, y: 0 });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [queueDirection, togglePause, startGame]);

  // Touch swipe support on Canvas
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    const minSwipe = 24; // minimum distance
    if (Math.max(absX, absY) > minSwipe) {
      if (absX > absY) {
        // Horizontal swipe
        if (dx > 0) queueDirection({ x: 1, y: 0 });
        else queueDirection({ x: -1, y: 0 });
      } else {
        // Vertical swipe
        if (dy > 0) queueDirection({ x: 0, y: 1 });
        else queueDirection({ x: 0, y: -1 });
      }
    }
    touchStartRef.current = null;
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const updated = sounds.toggleMute();
    setIsMuted(updated);
  };

  // Single file HTML generation string
  const singleFileHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Neon Serpent - Arcade Snake Game</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #080c14;
      color: #e2e8f0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      overflow-x: hidden;
      user-select: none;
      -webkit-user-select: none;
    }
    .game-card {
      background: #0d131f;
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 16px;
      box-shadow: 0 0 30px -5px rgba(16, 185, 129, 0.15), 0 20px 40px rgba(0,0,0,0.8);
      padding: 20px;
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .title {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #22d3ee;
      text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
    }
    .scoreboard {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .score-box {
      background: #111a2e;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
    }
    .score-label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    .score-value {
      font-size: 1.6rem;
      font-weight: 800;
      font-family: monospace;
      color: #10b981;
      text-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
    }
    .canvas-wrapper {
      position: relative;
      width: 400px;
      height: 400px;
      max-width: 100%;
      border-radius: 12px;
      overflow: hidden;
      border: 2px solid rgba(16, 185, 129, 0.3);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      background: #080c14;
    }
    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(8, 12, 20, 0.88);
      backdrop-filter: blur(4px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
      z-index: 10;
    }
    .btn {
      background: linear-gradient(135deg, #10b981, #06b6d4);
      color: #041017;
      font-weight: 700;
      font-size: 1rem;
      padding: 10px 24px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.4);
      transition: transform 0.15s, opacity 0.15s;
    }
    .btn:hover { opacity: 0.92; transform: translateY(-1px); }
    .btn:active { transform: translateY(1px); }
    .d-pad {
      display: grid;
      grid-template-columns: repeat(3, 52px);
      grid-template-rows: repeat(2, 52px);
      gap: 8px;
      margin-top: 16px;
      justify-content: center;
    }
    .d-btn {
      background: #111a2e;
      border: 1px solid rgba(255,255,255,0.1);
      color: #e2e8f0;
      font-weight: bold;
      font-size: 1.2rem;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
    }
    .d-btn:active { background: #10b981; color: #041017; }
    .d-up { grid-column: 2; grid-row: 1; }
    .d-left { grid-column: 1; grid-row: 2; }
    .d-down { grid-column: 2; grid-row: 2; }
    .d-right { grid-column: 3; grid-row: 2; }
  </style>
</head>
<body>
  <div class="game-card">
    <div class="header">
      <div class="title">NEON SERPENT</div>
      <div style="font-size: 0.8rem; color: #64748b;">ARCADE EDITION</div>
    </div>
    <div class="scoreboard">
      <div class="score-box">
        <span class="score-label">Current Score</span>
        <span class="score-value" id="score">0</span>
      </div>
      <div class="score-box">
        <span class="score-label">High Score</span>
        <span class="score-value" id="highScore" style="color: #38bdf8;">0</span>
      </div>
    </div>
    <div class="canvas-wrapper">
      <canvas id="gameCanvas" width="400" height="400"></canvas>
      <div id="overlay" class="overlay">
        <h2 id="overlayTitle" style="color: #22d3ee; margin-bottom: 8px; font-size: 1.5rem;">READY TO HUNT?</h2>
        <p id="overlaySub" style="color: #94a3b8; margin-bottom: 20px; font-size: 0.88rem;">Use Arrow Keys or WASD to control the serpent.</p>
        <button id="startBtn" class="btn">START GAME</button>
      </div>
    </div>
    <div class="d-pad">
      <button class="d-btn d-up" id="btnUp">▲</button>
      <button class="d-btn d-left" id="btnLeft">◀</button>
      <button class="d-btn d-down" id="btnDown">▼</button>
      <button class="d-btn d-right" id="btnRight">▶</button>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const highScoreEl = document.getElementById('highScore');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlaySub = document.getElementById('overlaySub');
    const startBtn = document.getElementById('startBtn');

    const GRID = 20;
    const CELL = 20;
    let snake = [{x: 10, y: 12}, {x: 10, y: 13}, {x: 10, y: 14}];
    let dir = {x: 0, y: -1};
    let inputQueue = [];
    let food = {x: 10, y: 6};
    let score = 0;
    let highScore = parseInt(localStorage.getItem('serpent_html_high') || '0', 10);
    highScoreEl.textContent = highScore;
    let isRunning = false;
    let isPaused = false;
    let lastTick = 0;

    // Web Audio Synthesizer
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;
    function playBeep(freq, type = 'sine', duration = 0.1) {
      try {
        if (!audioCtx) audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch(e) {}
    }

    function spawnFood() {
      let free = [];
      const occ = new Set(snake.map(p => p.x + ',' + p.y));
      for (let x = 0; x < GRID; x++) {
        for (let y = 0; y < GRID; y++) {
          if (!occ.has(x + ',' + y)) free.push({x, y});
        }
      }
      food = free[Math.floor(Math.random() * free.length)] || {x: 5, y: 5};
    }

    function queueDirection(newDir) {
      if (!isRunning || isPaused) return;
      const last = inputQueue.length ? inputQueue[inputQueue.length - 1] : dir;
      if (newDir.x === -last.x && newDir.y === -last.y) return;
      if (newDir.x === last.x && newDir.y === last.y) return;
      if (inputQueue.length < 2) inputQueue.push(newDir);
    }

    function startGame() {
      snake = [{x: 10, y: 12}, {x: 10, y: 13}, {x: 10, y: 14}];
      dir = {x: 0, y: -1};
      inputQueue = [];
      score = 0;
      scoreEl.textContent = '0';
      spawnFood();
      isRunning = true;
      isPaused = false;
      overlay.style.display = 'none';
      lastTick = performance.now();
      playBeep(440, 'triangle', 0.15);
    }

    function gameOver() {
      isRunning = false;
      playBeep(120, 'sawtooth', 0.3);
      if (score > highScore) {
        highScore = score;
        highScoreEl.textContent = highScore;
        localStorage.setItem('serpent_html_high', highScore);
      }
      overlayTitle.textContent = 'GAME OVER';
      overlayTitle.style.color = '#f43f5e';
      overlaySub.textContent = 'Final Score: ' + score + (score >= highScore && score > 0 ? ' — NEW HIGH SCORE!' : '');
      startBtn.textContent = 'PLAY AGAIN';
      overlay.style.display = 'flex';
    }

    function tick() {
      if (inputQueue.length) {
        const next = inputQueue.shift();
        if (!(next.x === -dir.x && next.y === -dir.y)) dir = next;
      }
      const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
      if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
        gameOver(); return;
      }
      for (let i = 0; i < snake.length - 1; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
          gameOver(); return;
        }
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreEl.textContent = score;
        playBeep(660, 'sine', 0.08);
        spawnFood();
      } else {
        snake.pop();
      }
    }

    function draw(now) {
      if (isRunning && !isPaused && now - lastTick >= Math.max(50, 110 - Math.floor(score / 30) * 5)) {
        tick();
        lastTick = now;
      }

      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, 400, 400);

      // Grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, 400); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(400, i * CELL); ctx.stroke();
      }

      // Food
      const pulse = Math.sin(now * 0.008) * 0.15 + 0.85;
      ctx.save();
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc((food.x + 0.5) * CELL, (food.y + 0.5) * CELL, (CELL * 0.38) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Snake
      snake.forEach((seg, i) => {
        const isHead = i === 0;
        ctx.save();
        if (isHead) {
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 12;
          ctx.fillStyle = '#22d3ee';
        } else {
          ctx.fillStyle = 'rgba(16, 185, 129, ' + (1 - i / snake.length * 0.5) + ')';
        }
        ctx.beginPath();
        ctx.roundRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4, isHead ? 6 : 4);
        ctx.fill();
        ctx.restore();
      });

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    window.addEventListener('keydown', e => {
      if (['ArrowUp','KeyW'].includes(e.code)) queueDirection({x:0, y:-1});
      if (['ArrowDown','KeyS'].includes(e.code)) queueDirection({x:0, y:1});
      if (['ArrowLeft','KeyA'].includes(e.code)) queueDirection({x:-1, y:0});
      if (['ArrowRight','KeyD'].includes(e.code)) queueDirection({x:1, y:0});
      if (e.code === 'Space') {
        if (!isRunning) startGame();
        else isPaused = !isPaused;
      }
    });

    startBtn.addEventListener('click', startGame);
    document.getElementById('btnUp').addEventListener('click', () => queueDirection({x:0, y:-1}));
    document.getElementById('btnDown').addEventListener('click', () => queueDirection({x:0, y:1}));
    document.getElementById('btnLeft').addEventListener('click', () => queueDirection({x:-1, y:0}));
    document.getElementById('btnRight').addEventListener('click', () => queueDirection({x:1, y:0}));
  </script>
</body>
</html>`;

  const copyCodeToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(singleFileHTML);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // fallback
    }
  };

  const downloadHtmlFile = () => {
    const blob = new Blob([singleFileHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'neon-serpent-snake.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen arcade-bg text-slate-100 flex flex-col items-center justify-between p-3 sm:p-6 select-none font-sans">
      {/* Top Navbar */}
      <header className="w-full max-w-xl flex items-center justify-between py-2 mb-2 sm:mb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/20">
            <Flame className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-wider text-slate-100 font-['Chakra_Petch'] flex items-center gap-2">
              NEON SERPENT
              <span className="text-[10px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                v2.0
              </span>
            </h1>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Audio Mute Button */}
          <button
            onClick={handleToggleMute}
            aria-label={isMuted ? "Unmute audio" : "Mute audio"}
            className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Export Code Modal Trigger */}
          <button
            onClick={() => setShowCodeModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-cyan-300 transition-colors text-xs font-mono font-semibold cursor-pointer"
            title="Get single HTML file"
          >
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">HTML File</span>
          </button>
        </div>
      </header>

      {/* Main Game Container */}
      <main className={`w-full max-w-md flex flex-col items-center ${shake ? 'animate-shake' : ''}`}>
        
        {/* Scoreboard Bar */}
        <section className="w-full grid grid-cols-2 gap-3 mb-3" aria-label="Scoreboard">
          {/* Current Score */}
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3 flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-mono text-slate-400 font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Score
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {applesEaten} apples
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 tracking-tight text-shadow-sm">
                {score}
              </span>
              {bonusEaten > 0 && (
                <span className="text-[10px] font-mono text-amber-400 font-bold">
                  +{bonusEaten} Star
                </span>
              )}
            </div>
            {/* Subtle glow highlight */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
          </div>

          {/* High Score */}
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3 flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-mono text-slate-400 font-semibold flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-400" /> Best
              </span>
              {isNewHighScore && (
                <span className="text-[10px] font-mono text-amber-300 font-bold animate-pulse">
                  NEW!
                </span>
              )}
            </div>
            <div className="mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400 tracking-tight">
                {highScore}
              </span>
            </div>
            <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/5 rounded-full blur-xl pointer-events-none" />
          </div>
        </section>

        {/* Controls / Difficulty Sub-bar */}
        <div className="w-full flex items-center justify-between px-1 mb-2.5 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-slate-500">SPEED:</span>
            {(['chill', 'classic', 'hyper'] as Difficulty[]).map(d => (
              <button
                key={d}
                disabled={gameState === 'PLAYING'}
                onClick={() => setDifficulty(d)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] uppercase transition-all cursor-pointer ${
                  difficulty === d 
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold' 
                    : 'text-slate-400 hover:text-slate-200 border border-transparent disabled:opacity-50'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-slate-500">WALLS:</span>
            <button
              disabled={gameState === 'PLAYING'}
              onClick={() => setWallMode(prev => prev === 'classic' ? 'portal' : 'classic')}
              className={`px-2 py-0.5 rounded font-mono text-[11px] uppercase transition-all cursor-pointer ${
                wallMode === 'portal'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
              } disabled:opacity-50`}
            >
              {wallMode === 'portal' ? 'Portal' : 'Solid'}
            </button>
          </div>
        </div>

        {/* Game Canvas Container */}
        <div className="relative w-[340px] h-[340px] sm:w-[400px] sm:h-[400px] rounded-2xl overflow-hidden border-2 border-slate-800 shadow-2xl bg-slate-950 flex items-center justify-center neon-border-green">
          <canvas
            ref={canvasRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{ width: '100%', height: '100%' }}
            className="block touch-none cursor-crosshair"
          />

          {/* START SCREEN OVERLAY */}
          {gameState === 'IDLE' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-500/20">
                <Gamepad2 className="w-8 h-8 text-emerald-400" />
              </div>

              <h2 className="text-xl sm:text-2xl font-black tracking-wider text-slate-100 font-['Chakra_Petch'] mb-1">
                CYBER SNAKE
              </h2>
              <p className="text-xs text-slate-400 max-w-xs mb-5 font-sans leading-relaxed">
                Pilot the neon serpent, devour glowing energy fruits, and evade wall & tail collisions.
              </p>

              <button
                onClick={startGame}
                className="w-48 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 hover:brightness-110 active:scale-95 transition-all cursor-pointer font-['Chakra_Petch']"
              >
                <Play className="w-4 h-4 fill-slate-950" /> Start Mission
              </button>

              <div className="mt-5 flex items-center gap-4 text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">WASD</span>
                  or
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">ARROWS</span>
                </span>
                <span>•</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">SPACE</kbd> Pause</span>
              </div>
            </div>
          )}

          {/* PAUSE OVERLAY */}
          {gameState === 'PAUSED' && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-2">
                <Pause className="w-6 h-6 fill-cyan-400 text-cyan-400" />
              </div>
              <h2 className="text-xl font-bold font-['Chakra_Petch'] text-slate-100 mb-1">
                SYSTEM PAUSED
              </h2>
              <p className="text-xs text-slate-400 mb-4 font-mono">Current Score: {score}</p>

              <button
                onClick={togglePause}
                className="w-40 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-sm uppercase tracking-wide shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                Resume
              </button>
            </div>
          )}

          {/* GAME OVER OVERLAY */}
          {gameState === 'GAMEOVER' && (
            <div className="absolute inset-0 bg-slate-950/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-fade-in">
              <div className="w-13 h-13 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-2 shadow-lg shadow-rose-500/20">
                <ShieldAlert className="w-7 h-7 text-rose-400" />
              </div>

              <h2 className="text-2xl font-black font-['Chakra_Petch'] text-rose-400 tracking-wider mb-1">
                SIGNAL LOST
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                The serpent suffered fatal hull disruption.
              </p>

              {/* Stats Card */}
              <div className="w-64 bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 mb-5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-mono">FINAL SCORE</span>
                  <span className="text-base font-bold font-mono text-emerald-400">{score}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-mono">ENERGY HARVESTED</span>
                  <span className="font-mono text-slate-200">{applesEaten} apples</span>
                </div>
                {isNewHighScore && (
                  <div className="pt-1.5 border-t border-slate-800 flex items-center justify-center gap-1.5 text-xs font-bold font-mono text-amber-300">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" /> NEW RECORD!
                  </div>
                )}
              </div>

              <button
                onClick={startGame}
                className="w-48 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 hover:brightness-110 active:scale-95 transition-all cursor-pointer font-['Chakra_Petch']"
              >
                <RotateCcw className="w-4 h-4" /> Play Again
              </button>
            </div>
          )}

          {/* Quick Pause In-Game Floating Button */}
          {gameState === 'PLAYING' && (
            <button
              onClick={togglePause}
              className="absolute top-2.5 right-2.5 p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/60 text-slate-300 hover:text-white backdrop-blur-sm transition-all cursor-pointer z-10"
              title="Pause Game (Space)"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* On-Screen Mobile Touch D-Pad Controls */}
        <section className="w-full max-w-[280px] mt-4 flex flex-col items-center select-none" aria-label="Touch Gamepad Controls">
          {/* Top Row: UP */}
          <div className="flex justify-center mb-1.5">
            <button
              onClick={() => queueDirection({ x: 0, y: -1 })}
              aria-label="Move Up"
              className="w-14 h-12 rounded-xl bg-slate-900/90 hover:bg-slate-800 active:bg-emerald-500 active:text-slate-950 border border-slate-700/80 text-slate-200 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>

          {/* Middle Row: LEFT, DOWN, RIGHT */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => queueDirection({ x: -1, y: 0 })}
              aria-label="Move Left"
              className="w-14 h-12 rounded-xl bg-slate-900/90 hover:bg-slate-800 active:bg-emerald-500 active:text-slate-950 border border-slate-700/80 text-slate-200 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <button
              onClick={() => queueDirection({ x: 0, y: 1 })}
              aria-label="Move Down"
              className="w-14 h-12 rounded-xl bg-slate-900/90 hover:bg-slate-800 active:bg-emerald-500 active:text-slate-950 border border-slate-700/80 text-slate-200 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <ArrowDown className="w-5 h-5" />
            </button>

            <button
              onClick={() => queueDirection({ x: 1, y: 0 })}
              aria-label="Move Right"
              className="w-14 h-12 rounded-xl bg-slate-900/90 hover:bg-slate-800 active:bg-emerald-500 active:text-slate-950 border border-slate-700/80 text-slate-200 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </section>
      </main>

      {/* Footer info */}
      <footer className="w-full max-w-xl text-center py-2 mt-3 text-[11px] text-slate-500 font-mono flex items-center justify-center gap-3">
        <span>SWIPE OR ARROW KEYS</span>
        <span>•</span>
        <span>ARCADE SOUNDS ENABLED</span>
      </footer>

      {/* MODAL: Export / Download Single-File HTML */}
      {showCodeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-slate-200 text-sm font-['Chakra_Petch']">
                  Single-File HTML Code (Stand-alone Game)
                </h3>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 flex-1 overflow-hidden">
              <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    Zero dependencies. Save as <code className="text-emerald-300 font-mono">snake.html</code> and run directly in any browser offline.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyCodeToClipboard}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-semibold transition-all cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                  <button
                    onClick={downloadHtmlFile}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-semibold transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .html</span>
                  </button>
                </div>
              </div>

              {/* Code Preview */}
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-auto font-mono text-[11px] text-slate-300 leading-relaxed select-text">
                <pre>{singleFileHTML}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
