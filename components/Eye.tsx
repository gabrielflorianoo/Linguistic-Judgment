
import React, { useState, useEffect, useRef } from 'react';
import { PersonaType } from '../types';

interface EyeProps {
  isTyping: boolean;
  isAngry: boolean;
  isLowTime: boolean;
  isThinking: boolean;
  primaryColor: string;
  volume: number;
  persona: PersonaType;
  tension: number;
  lookAt: { x: number, y: number }; // -1 to 1 based on face position
}

export const Eye: React.FC<EyeProps> = ({ isTyping, isAngry, isLowTime, isThinking, primaryColor, volume, persona, tension, lookAt }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let blinkTimer: ReturnType<typeof setTimeout>;
    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
      const nextBlink = Math.random() * (4000 - (tension * 30)) + 1000;
      blinkTimer = setTimeout(blink, nextBlink);
    };
    blink();
    return () => clearTimeout(blinkTimer);
  }, [tension]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const limit = isTyping ? 30 : 20;
      const moveX = (dx / (distance || 1)) * Math.min(distance / 12, limit);
      const moveY = (dy / (distance || 1)) * Math.min(distance / 12, limit);
      
      setMousePos({ x: moveX, y: moveY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isTyping]);

  const dilation = 1 + (volume * 1.8) + (tension / 100);

  const getPupilStyle = () => {
    switch(persona) {
      case 'Commander': return 'w-1 h-16 md:w-2 md:h-20 rounded-[40%] bg-red-600';
      case 'Ancient Deity': return 'w-0 h-0 opacity-0';
      case 'Merciful': return 'w-6 h-6 md:w-8 md:h-8 rotate-45 rounded-sm bg-yellow-400';
      case 'Chaos Weaver': return 'w-12 h-4 md:w-16 md:h-6 bg-white skew-x-12 animate-pulse';
      default: return 'w-8 h-8 md:w-10 md:h-10 rounded-full';
    }
  };

  const getAuraColor = () => {
    if (isAngry) return 'rgba(255, 0, 0, 0.8)';
    switch(persona) {
      case 'Ancient Deity': return 'rgba(255, 255, 255, 0.6)';
      case 'Commander': return 'rgba(255, 49, 49, 0.7)';
      case 'Merciful': return 'rgba(255, 176, 0, 0.4)';
      case 'Chaos Weaver': return 'rgba(188, 19, 254, 0.6)';
      default: return `${primaryColor}66`;
    }
  };

  // Combine mouse and lookAt (face) tracking
  const finalX = mousePos.x + (lookAt.x * 30);
  const finalY = mousePos.y + (lookAt.y * 30);

  return (
    <div 
      ref={containerRef}
      className={`relative w-44 h-44 md:w-72 md:h-72 transition-all duration-500 rounded-full flex items-center justify-center 
        ${persona === 'Chaos Weaver' || tension > 80 ? 'animate-[shake_0.1s_infinite]' : ''}`}
      style={{
        boxShadow: `0 0 ${100 + tension}px ${getAuraColor()}`,
        filter: tension > 50 ? `hue-rotate(${tension}deg) blur(${tension/50}px)` : 'none',
        transform: isLowTime ? `translate(${(Math.random() - 0.5) * 8}px, ${(Math.random() - 0.5) * 8}px)` : 'none'
      }}
    >
      <style>{`
        @keyframes shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          50% { transform: translate(-2px, 0px) rotate(1deg); }
          100% { transform: translate(1px, -1px) rotate(0deg); }
        }
      `}</style>
      
      <div 
        className={`absolute inset-0 border-4 rounded-full transition-all duration-700 
          ${isAngry ? 'border-red-600 scale-110' : persona === 'Ancient Deity' ? 'border-white/50 opacity-60' : ''}`}
        style={{ borderColor: !isAngry && persona !== 'Ancient Deity' ? primaryColor : undefined }}
      />
      
      <div className={`absolute inset-4 bg-black rounded-full overflow-hidden flex items-center justify-center border-2 transition-all ${persona === 'Ancient Deity' ? 'bg-zinc-900 border-white/20' : 'border-transparent'}`}>
        <div className={`absolute top-0 left-0 w-full bg-[#0a0a0a] transition-all duration-150 z-20 ${isBlinking ? 'h-1/2' : 'h-0'}`} />
        <div className={`absolute bottom-0 left-0 w-full bg-[#0a0a0a] transition-all duration-150 z-20 ${isBlinking ? 'h-1/2' : 'h-0'}`} />

        <div 
          className={`relative transition-all duration-200 ease-out flex items-center justify-center
            ${isThinking ? 'animate-spin' : ''}`}
          style={{ 
            transform: `translate(${finalX}px, ${finalY}px) scale(${dilation})`,
          }}
        >
          <div 
            className={`w-24 h-24 md:w-40 md:h-40 rounded-full border-2 transition-all duration-500 flex items-center justify-center
              ${isAngry ? 'bg-red-950/40 border-red-500' : 'bg-black'}
              ${persona === 'Ancient Deity' ? 'bg-white/10 blur-md scale-110' : ''}`}
            style={{ 
              borderColor: !isAngry && persona !== 'Ancient Deity' ? primaryColor : undefined,
            }}
          >
            <div 
              className={`transition-all duration-300 border-2 ${getPupilStyle()}
                ${isThinking ? 'scale-125 rotate-180' : 'scale-100'}`}
              style={{ 
                borderColor: persona === 'Merciful' ? '#ffb000' : persona === 'Ancient Deity' ? 'transparent' : isAngry ? '#ff3131' : primaryColor,
                boxShadow: persona === 'Chaos Weaver' ? '0 0 25px #bc13fe' : 'none'
              }}
            />
          </div>
          <div className="absolute top-2 left-4 md:top-4 md:left-6 w-3 h-3 md:w-4 md:h-4 bg-white/20 rounded-full blur-[1px]" />
        </div>
      </div>
    </div>
  );
};
