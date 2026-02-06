import React, { memo } from 'react';
import { useStore } from '../store';

const TICKS_PER_WORKDAY = 480;
const W = 360;
const H = 200;
// Must match the canvas background color (bg-slate-50)
const CANVAS_BG = '#f8fafc';

const SunMoonCycle: React.FC = () => {
  const tickCount = useStore((state) => state.tickCount);
  const isRunning = useStore((state) => state.isRunning);
  const simulationProgress = useStore((state) => state.simulationProgress);
  const targetDuration = useStore((state) => state.targetDuration);

  const dayProgress = (tickCount % TICKS_PER_WORKDAY) / TICKS_PER_WORKDAY;

  // Sun arc: left to right along a semicircle
  const angle = Math.PI * (1 - dayProgress);
  const cx = W / 2;
  const cy = H * 0.75;
  const radius = H * 0.5;
  const bodyX = cx + radius * Math.cos(angle);
  const bodyY = cy - radius * Math.sin(angle);

  // Moon follows opposite arc
  const moonAngle = angle + Math.PI;
  const moonX = cx + radius * Math.cos(moonAngle);
  const moonY = cy - radius * Math.sin(moonAngle);
  const moonVisible = dayProgress > 0.45;

  // Sky colors
  let skyTop: string;
  let skyBottom: string;
  let horizonColor: string;

  if (dayProgress < 0.1) {
    skyTop = '#fde68a';
    skyBottom = '#fb923c';
    horizonColor = '#f97316';
  } else if (dayProgress < 0.2) {
    skyTop = '#bae6fd';
    skyBottom = '#fde68a';
    horizonColor = '#fbbf24';
  } else if (dayProgress > 0.9) {
    skyTop = '#c084fc';
    skyBottom = '#f97316';
    horizonColor = '#ea580c';
  } else if (dayProgress > 0.8) {
    skyTop = '#93c5fd';
    skyBottom = '#fde68a';
    horizonColor = '#f59e0b';
  } else {
    skyTop = '#7dd3fc';
    skyBottom = '#bae6fd';
    horizonColor = '#38bdf8';
  }

  return (
    <div
      className="relative overflow-hidden rounded-bl-3xl bg-white/70 backdrop-blur-md"
      style={{ width: W, height: H + 36 }}
      title={`Workday progress: ${Math.round(dayProgress * 100)}%`}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="smc-sky-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="100%" stopColor={skyBottom} />
          </linearGradient>
          <radialGradient id="smc-sun-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
          {/* Left fade: canvas bg going from opaque to transparent */}
          <linearGradient id="smc-fade-left" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={CANVAS_BG} stopOpacity="1" />
            <stop offset="35%" stopColor={CANVAS_BG} stopOpacity="0" />
          </linearGradient>
          {/* Bottom fade: canvas bg going from transparent to opaque */}
          <linearGradient id="smc-fade-bottom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="60%" stopColor={CANVAS_BG} stopOpacity="0" />
            <stop offset="100%" stopColor={CANVAS_BG} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Sky */}
        <rect x="0" y="0" width={W} height={H} fill="url(#smc-sky-grad)" />

        {/* Clouds */}
        <ellipse cx={W * 0.45} cy={H * 0.15} rx="30" ry="5" fill="white" opacity="0.3" />
        <ellipse cx={W * 0.7} cy={H * 0.22} rx="20" ry="4" fill="white" opacity="0.25" />
        <ellipse cx={W * 0.25} cy={H * 0.3} rx="16" ry="3" fill="white" opacity="0.2" />

        {/* Sun */}
        <circle cx={bodyX} cy={bodyY} r="22" fill="url(#smc-sun-glow)" />
        <circle cx={bodyX} cy={bodyY} r="10" fill="#fbbf24" />
        <circle cx={bodyX} cy={bodyY} r="7" fill="#fde68a" />

        {/* Moon */}
        {moonVisible && (
          <>
            <circle cx={moonX} cy={moonY} r="11" fill="#e0f2fe" opacity="0.9" />
            <circle cx={moonX + 4} cy={moonY - 3} r="3" fill="#bae6fd" opacity="0.9" />
            <circle cx={moonX - 3} cy={moonY + 2} r="2.5" fill="#bae6fd" opacity="0.8" />
          </>
        )}

        {/* Horizon ground */}
        <rect x="0" y={H * 0.75} width={W} height={H * 0.25} fill={horizonColor} opacity="0.3" />
        <line x1="0" y1={H * 0.75} x2={W} y2={H * 0.75} stroke={horizonColor} strokeWidth="0.5" opacity="0.5" />

        {/* Landscape silhouette */}
        <path
          d={`M0 ${H * 0.85} Q${W * 0.12} ${H * 0.78} ${W * 0.23} ${H * 0.82} Q${W * 0.35} ${H * 0.75} ${W * 0.46} ${H * 0.8} Q${W * 0.58} ${H * 0.72} ${W * 0.69} ${H * 0.76} Q${W * 0.8} ${H * 0.73} ${W * 0.92} ${H * 0.78} L${W} ${H * 0.75} L${W} ${H} L0 ${H} Z`}
          fill="#16a34a"
          opacity="0.3"
        />

        {/* Fade overlays: canvas-colored gradients that blend edges into the background */}
        <rect x="0" y="0" width={W} height={H} fill="url(#smc-fade-left)" />
        <rect x="0" y="0" width={W} height={H} fill="url(#smc-fade-bottom)" />

        {/* Paused indicator */}
        {!isRunning && tickCount > 0 && (
          <g opacity="0.6">
            <rect x={W * 0.46} y={H * 0.3} width="6" height="16" rx="1.5" fill="white" />
            <rect x={W * 0.46 + 11} y={H * 0.3} width="6" height="16" rx="1.5" fill="white" />
          </g>
        )}
      </svg>

      {/* Progress bar below the sky */}
      <div className="px-4 pb-4 pt-2">
        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 mb-1">
          <span>Simulation Progress</span>
          <span>{targetDuration === Infinity ? '--' : `${simulationProgress.toFixed(0)}%`}</span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              simulationProgress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(100, targetDuration === Infinity ? 0 : simulationProgress)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default memo(SunMoonCycle);
