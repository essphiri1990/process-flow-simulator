import React from 'react';
import { ResourcePoolAvatarId, ResourcePoolColorId } from '../types';
import { RESOURCE_POOL_AVATAR_PALETTES, RESOURCE_POOL_COLOR_THEMES } from '../resourcePoolVisuals';

interface ResourcePoolAvatarProps {
  avatarId: ResourcePoolAvatarId;
  colorId?: ResourcePoolColorId;
  size?: number;
  className?: string;
}

const ResourcePoolAvatar: React.FC<ResourcePoolAvatarProps> = ({ avatarId, colorId, size = 44, className = '' }) => {
  const palette = colorId ? RESOURCE_POOL_COLOR_THEMES[colorId] : RESOURCE_POOL_AVATAR_PALETTES[avatarId];
  const s = { stroke: palette.primary, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  const renderFace = () => {
    // Shared: head circle + two dot eyes
    const head = <circle cx="32" cy="34" r="16" fill="#ffffff" stroke={palette.primary} strokeWidth="2.6" />;
    const eyes = (
      <>
        <circle cx="26.5" cy="33" r="2" fill={palette.primary} />
        <circle cx="37.5" cy="33" r="2" fill={palette.primary} />
      </>
    );

    switch (avatarId) {
      case 'orbit':
        // Smiling face with short spiky hair
        return (
          <>
            {head}
            {/* Spiky hair */}
            <path d="M20 24 L23 15 L27 22 L32 13 L37 22 L41 15 L44 24" {...s} stroke={palette.primary} strokeWidth="2.8" />
            {eyes}
            {/* Smile */}
            <path d="M27 38 Q32 43 37 38" {...s} strokeWidth="2.2" />
          </>
        );
      case 'bloom':
        // Face with round bun/topknot + rosy cheeks
        return (
          <>
            {head}
            {/* Topknot bun */}
            <circle cx="32" cy="14" r="7" fill={palette.accent} stroke={palette.primary} strokeWidth="2.4" />
            {eyes}
            {/* Rosy cheeks */}
            <circle cx="23" cy="37" r="3" fill={palette.accent} opacity="0.35" />
            <circle cx="41" cy="37" r="3" fill={palette.accent} opacity="0.35" />
            {/* Small smile */}
            <path d="M29 39 Q32 42 35 39" {...s} strokeWidth="2" />
          </>
        );
      case 'spark':
        // Face with glasses + flat top hair
        return (
          <>
            {head}
            {/* Flat top hair */}
            <rect x="18" y="14" width="28" height="8" rx="4" fill={palette.accent} stroke={palette.primary} strokeWidth="2.4" />
            {/* Glasses */}
            <circle cx="26.5" cy="33" r="5" fill="none" stroke={palette.primary} strokeWidth="2" />
            <circle cx="37.5" cy="33" r="5" fill="none" stroke={palette.primary} strokeWidth="2" />
            <path d="M31.5 33 L32.5 33" stroke={palette.primary} strokeWidth="2" />
            {/* Eyes inside glasses */}
            <circle cx="26.5" cy="33" r="1.6" fill={palette.primary} />
            <circle cx="37.5" cy="33" r="1.6" fill={palette.primary} />
            {/* Neutral mouth */}
            <path d="M28 40 L36 40" {...s} strokeWidth="2" />
          </>
        );
      case 'wave':
        // Face with side-swept wavy hair + wink
        return (
          <>
            {head}
            {/* Side-swept hair */}
            <path d="M17 26 Q20 12 32 14 Q44 12 46 22" fill={palette.accent} stroke={palette.primary} strokeWidth="2.4" />
            <path d="M17 26 Q22 20 28 24" fill="none" stroke={palette.primary} strokeWidth="2" />
            {/* Left eye open, right eye winking */}
            <circle cx="26.5" cy="33" r="2" fill={palette.primary} />
            <path d="M35 33 L40 33" stroke={palette.primary} strokeWidth="2.4" strokeLinecap="round" />
            {/* Grin */}
            <path d="M27 38 Q32 44 37 38" {...s} strokeWidth="2.2" />
          </>
        );
      case 'stack':
        // Face with beanie/cap + open mouth surprise
        return (
          <>
            {head}
            {/* Beanie */}
            <path d="M16 28 Q16 14 32 12 Q48 14 48 28" fill={palette.accent} stroke={palette.primary} strokeWidth="2.4" />
            <line x1="16" y1="28" x2="48" y2="28" stroke={palette.primary} strokeWidth="2.6" />
            {/* Pom-pom */}
            <circle cx="32" cy="10" r="3.5" fill="#ffffff" stroke={palette.primary} strokeWidth="2" />
            {eyes}
            {/* Open mouth (surprised) */}
            <ellipse cx="32" cy="40" rx="3.5" ry="3" fill={palette.primary} />
          </>
        );
      case 'kite':
        // Face with headband + determined look
        return (
          <>
            {head}
            {/* Headband */}
            <path d="M16 27 Q32 22 48 27" fill="none" stroke={palette.accent} strokeWidth="4" strokeLinecap="round" />
            <path d="M46 27 L52 22 L50 30" fill={palette.accent} stroke={palette.primary} strokeWidth="1.8" />
            {/* Determined eyes (flat top) */}
            <path d="M24 31 L29 31" stroke={palette.primary} strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="26.5" cy="34" r="1.8" fill={palette.primary} />
            <path d="M35 31 L40 31" stroke={palette.primary} strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="37.5" cy="34" r="1.8" fill={palette.primary} />
            {/* Determined mouth */}
            <path d="M28 40 L36 39" {...s} strokeWidth="2.2" />
          </>
        );
      case 'bot':
        // Robot face with antenna + square eyes
        return (
          <>
            {head}
            {/* Antenna */}
            <line x1="32" y1="18" x2="32" y2="10" stroke={palette.primary} strokeWidth="2.4" />
            <circle cx="32" cy="8" r="3" fill={palette.accent} stroke={palette.primary} strokeWidth="2" />
            {/* Square eyes */}
            <rect x="24" y="30" width="5" height="5" rx="1" fill={palette.accent} stroke={palette.primary} strokeWidth="1.8" />
            <rect x="35" y="30" width="5" height="5" rx="1" fill={palette.accent} stroke={palette.primary} strokeWidth="1.8" />
            {/* Pupils */}
            <circle cx="26.5" cy="32.5" r="1.2" fill={palette.primary} />
            <circle cx="37.5" cy="32.5" r="1.2" fill={palette.primary} />
            {/* Grid mouth */}
            <rect x="27" y="39" width="10" height="5" rx="1" fill="none" stroke={palette.primary} strokeWidth="1.8" />
            <line x1="30" y1="39" x2="30" y2="44" stroke={palette.primary} strokeWidth="1.2" />
            <line x1="34" y1="39" x2="34" y2="44" stroke={palette.primary} strokeWidth="1.2" />
            <line x1="27" y1="41.5" x2="37" y2="41.5" stroke={palette.primary} strokeWidth="1.2" />
          </>
        );
      case 'brain':
        // AI face with circuit-pattern forehead + glowing eyes
        return (
          <>
            {head}
            {/* Circuit lines on forehead */}
            <circle cx="32" cy="12" r="4" fill="none" stroke={palette.accent} strokeWidth="2.2" />
            <line x1="32" y1="16" x2="32" y2="22" stroke={palette.accent} strokeWidth="2" />
            <line x1="28" y1="12" x2="22" y2="12" stroke={palette.accent} strokeWidth="1.6" />
            <circle cx="21" cy="12" r="1.5" fill={palette.accent} />
            <line x1="36" y1="12" x2="42" y2="12" stroke={palette.accent} strokeWidth="1.6" />
            <circle cx="43" cy="12" r="1.5" fill={palette.accent} />
            {/* Glowing diamond eyes */}
            <path d="M26.5 30 L29 33 L26.5 36 L24 33 Z" fill={palette.accent} stroke={palette.primary} strokeWidth="1.6" />
            <path d="M37.5 30 L40 33 L37.5 36 L35 33 Z" fill={palette.accent} stroke={palette.primary} strokeWidth="1.6" />
            {/* Subtle smile */}
            <path d="M29 40 Q32 43 35 40" {...s} strokeWidth="2" />
          </>
        );
    }
  };

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,0.85)] ${className}`.trim()}
      style={{
        width: size,
        height: size,
        backgroundColor: palette.circle,
      }}
    >
      <svg width={size - 6} height={size - 6} viewBox="6 4 52 52" fill="none" aria-hidden="true">
        {renderFace()}
      </svg>
    </div>
  );
};

export default ResourcePoolAvatar;
