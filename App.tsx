
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type } from '@google/genai';
import { Eye } from './components/Eye';
import { GameState, Message, Language, PersonaType, Difficulty, GameSettings, NarrativePath, Ability } from './types';
import { LANGUAGES, PERSONAS, PATHS, SKILLS, INITIAL_LIVES, WINNING_TURNS, DIFFICULTY_CONFIG, THEME_COLORS, SURRENDER_PHRASES } from './constants';
import { 
  Terminal as TerminalIcon, Heart, Timer, Target, AlertTriangle, 
  Play, RefreshCw, Trophy, Skull, Settings, HelpCircle, X,
  Sun, Moon, Zap, ArrowLeft, Flag, Mic, MicOff, Ghost, Info, Send, Camera, BookOpen, Star, ChevronRight
} from 'lucide-react';

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const App: React.FC = () => {
  const [state, setState] = useState<GameState>({
    status: 'start',
    lives: INITIAL_LIVES,
    turn: 0,
    targetLanguage: null,
    difficulty: 'Diplomat',
    persona: 'Inquisitor',
    timeLeft: 60,
    hasSeenTutorial: false,
    tension: 0,
    path: 'Negotiator',
    isSettingsOpen: false,
    isSkillTreeOpen: false,
    scavengeTarget: null
  });

  const [settings, setSettings] = useState<GameSettings>(() => {
    const saved = localStorage.getItem('worldsend-v3-settings');
    if (saved) return JSON.parse(saved);
    return {
      primaryColor: '#00ff41',
      theme: 'dark',
      baseTime: 60,
      xp: 0,
      unlockedAbilities: []
    };
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isAngry, setIsAngry] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [ironicPhrase, setIronicPhrase] = useState('');
  const [lookAt, setLookAt] = useState({ x: 0, y: 0 });
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioCtxRefs = useRef<{input?: AudioContext, output?: AudioContext}>({});
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('worldsend-v3-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (state.status === 'playing') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, state.status]);

  const handleLoseLife = useCallback((reason: string) => {
    if (settings.unlockedAbilities.includes('Grammar Shield')) {
      setSettings(s => ({ ...s, unlockedAbilities: s.unlockedAbilities.filter(a => a !== 'Grammar Shield') }));
      setMessages(prev => [...prev, { role: 'ai', content: "SHIELD ACTIVATED. PROTOCOL BREACH NEUTRALIZED.", timestamp: Date.now() }]);
      return;
    }
    setIsAngry(true);
    setTimeout(() => setIsAngry(false), 2000);
    setState(prev => {
      const nl = prev.lives - 1;
      return nl <= 0 ? { ...prev, lives: 0, status: 'gameover' } : { ...prev, lives: nl };
    });
    setMessages(prev => [...prev, { role: 'ai', content: reason, isError: true, timestamp: Date.now() }]);
  }, [settings.unlockedAbilities]);

  const connectToLive = async () => {
    try {
      setPermissionError(null);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRefs.current = { input: inCtx, output: outCtx };

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        setPermissionError("Microphone Access Denied. Live analysis disabled.");
        throw err;
      });
      
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => {
        console.warn("Camera access denied. Object proof-of-life disabled.");
        return null;
      });

      if (videoRef.current && camStream) videoRef.current.srcObject = camStream;

      const persona = PERSONAS[state.persona];
      const path = PATHS[state.path];

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsLiveActive(true);
            const source = inCtx.createMediaStreamSource(micStream);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const data = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
              setCurrentVolume(Math.sqrt(sum / data.length));
              const int16 = new Int16Array(data.length);
              for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(processor);
            processor.connect(inCtx.destination);

            // Frame Streaming
            const frameInterval = setInterval(() => {
              if (videoRef.current && canvasRef.current && camStream) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                   ctx.drawImage(videoRef.current, 0, 0, 320, 240);
                   canvasRef.current.toBlob(blob => {
                     if (blob) {
                       blob.arrayBuffer().then(ab => {
                         sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encode(new Uint8Array(ab)), mimeType: 'image/jpeg' } }));
                       });
                     }
                   }, 'image/jpeg', 0.5);
                }
              }
            }, 3000);
            
            return () => clearInterval(frameInterval);
          },
          onmessage: async (m: LiveServerMessage) => {
            if (m.toolCall) {
              for (const fc of m.toolCall.functionCalls) {
                if (fc.name === 'update_game_state') {
                  const { tension_delta, persona_shift, xp_gain, scavenge_item } = fc.args;
                  setState(s => ({
                    ...s,
                    tension: Math.min(100, Math.max(0, s.tension + (tension_delta || 0))),
                    persona: (persona_shift as PersonaType) || s.persona,
                    scavengeTarget: scavenge_item || s.scavengeTarget
                  }));
                  setSettings(s => ({ ...s, xp: s.xp + (xp_gain || 0) }));
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "OK" } } }));
                }
              }
            }
            if (m.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              const audioData = m.serverContent.modelTurn.parts[0].inlineData.data;
              const audio = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = audio;
              source.connect(outCtx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current = Math.max(outCtx.currentTime, nextStartTimeRef.current) + audio.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }
            if (m.serverContent?.turnComplete) {
              setState(s => ({ ...s, turn: Math.min(s.turn + 1, WINNING_TURNS), timeLeft: DIFFICULTY_CONFIG[s.difficulty].time }));
              if (state.turn >= WINNING_TURNS) setState(s => ({ ...s, status: 'victory' }));
            }
            if (m.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => setIsLiveActive(false),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voice } } },
          tools: [{
            functionDeclarations: [{
              name: 'update_game_state',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  tension_delta: { type: Type.INTEGER },
                  persona_shift: { type: Type.STRING },
                  xp_gain: { type: Type.INTEGER },
                  scavenge_item: { type: Type.STRING, description: 'Ask the user to find a physical object.' }
                }
              }
            }]
          }],
          systemInstruction: `JUDGE HUMANITY in ${state.targetLanguage?.name}. 
            PATH: ${path.name} - ${path.instruction}
            DIFFICULTY: ${state.difficulty}. 
            PERSONA: ${persona.systemInstruction}
            BARGE-IN: If user hesitates (Umm/Uh), INTERRUPT & MOCK.
            VISUALS: You see the user via camera. If they look away, increase tension.
            SCAVENGING: Ask them to show objects to prove life.
            ADAPTIVE: Faster speech & idioms if tension > 50. Use update_game_state tool often.`
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
    }
  };

  const buySkill = (skill: (typeof SKILLS)[0]) => {
    if (settings.xp >= skill.cost && !settings.unlockedAbilities.includes(skill.id as Ability)) {
      setSettings(s => ({
        ...s,
        xp: s.xp - skill.cost,
        unlockedAbilities: [...s.unlockedAbilities, skill.id as Ability]
      }));
    }
  };

  useEffect(() => {
    if (state.status === 'playing' && !state.isSettingsOpen && !state.isSkillTreeOpen) {
      timerRef.current = setInterval(() => {
        setState(s => {
          if (s.timeLeft <= 0) { handleLoseLife("TIME DEPLETED. HESITATION IS FATAL."); return { ...s, timeLeft: DIFFICULTY_CONFIG[s.difficulty].time }; }
          return { ...s, timeLeft: s.timeLeft - 1 };
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.status, state.isSettingsOpen, state.isSkillTreeOpen, handleLoseLife]);

  const isDark = settings.theme === 'dark';

  return (
    <div className={`flex flex-col h-screen w-screen font-mono transition-all duration-500 relative safe-area-padding ${isDark ? 'bg-[#050505] text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`} style={{ '--primary-color': settings.primaryColor } as any}>
      
      {/* Header */}
      <div className={`flex justify-between items-center px-4 h-16 shrink-0 z-50 border-b backdrop-blur-md transition-colors duration-500 ${isDark ? 'bg-black/40 border-white/5' : 'bg-white/40 border-black/5'}`}>
        <div className="flex items-center gap-2" style={{ color: settings.primaryColor }}>
          <TerminalIcon className="w-5 h-5" />
          <h1 className="font-orbitron font-bold text-xs md:text-sm tracking-widest uppercase">TRIAL v3.1</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <Star size={12} className="text-yellow-500" />
            <span>{settings.xp} XP</span>
          </div>
          <button onClick={() => setState(s => ({ ...s, isSkillTreeOpen: true }))} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`} aria-label="Skill Tree"><BookOpen size={18} /></button>
          <button onClick={() => setState(s => ({ ...s, isSettingsOpen: true }))} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`} aria-label="Settings"><Settings size={18} /></button>
        </div>
      </div>

      <main className="flex-1 flex flex-col md:flex-row min-h-0 relative overflow-hidden">
        
        {/* Visual Anchor */}
        <div className={`flex flex-col items-center justify-center shrink-0 p-4 transition-all duration-700 ${state.status === 'playing' ? 'h-[30%] md:h-full md:w-1/3' : 'flex-1 md:w-1/2'}`}>
          <div className={`transition-all duration-700 ${state.status === 'playing' ? 'scale-[0.4] sm:scale-[0.6] md:scale-100' : 'scale-100'}`}>
            <Eye 
              isTyping={isTyping} 
              isAngry={isAngry || state.status === 'surrender'} 
              isLowTime={state.status === 'playing' && state.timeLeft <= 10} 
              isThinking={isThinking} 
              primaryColor={settings.primaryColor} 
              volume={currentVolume} 
              persona={state.persona}
              tension={state.tension}
              lookAt={lookAt}
            />
          </div>
          
          <div className={`relative rounded-xl border overflow-hidden transition-all shadow-xl bg-black ${state.status === 'playing' ? 'hidden md:block w-32 h-24 mt-4 border-white/10' : 'hidden'}`}>
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover opacity-60" />
            <canvas ref={canvasRef} className="hidden" width="320" height="240" />
          </div>
        </div>

        {/* Dynamic Content */}
        <div className={`flex-1 flex flex-col relative transition-all duration-500 overflow-hidden ${state.status === 'playing' ? 'h-[70%] md:h-full' : ''}`}>
          
          <div className="flex-1 overflow-y-auto relative p-4 md:p-8 flex flex-col items-center justify-center w-full">
            
            {state.status === 'start' && (
              <div className="w-full max-w-2xl space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="text-center">
                  <Ghost className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <h2 className="text-3xl md:text-5xl font-orbitron font-bold tracking-tight mb-2" style={{ color: settings.primaryColor }}>INITIATE TRIAL</h2>
                  <p className="text-xs md:text-sm opacity-50 uppercase tracking-[0.2em]">Select language protocol to begin</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {LANGUAGES.map(l => (
                    <button key={l.code} onClick={() => setState(s => ({ ...s, targetLanguage: l, status: 'difficulty' }))} className={`p-4 md:p-6 border rounded-2xl text-left transition-all active:scale-95 glitch-hover ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-black/5 border-black/10 hover:bg-black/10'}`}>
                      <div className="text-[10px] font-bold opacity-40 uppercase mb-1" style={{ color: settings.primaryColor }}>{l.name}</div>
                      <div className="font-bold text-sm md:text-base">{l.nativeName}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {state.status === 'difficulty' && (
              <div className="w-full max-w-sm space-y-6 animate-in slide-in-from-right duration-500">
                <button onClick={() => setState(s => ({ ...s, status: 'start' }))} className="flex items-center gap-2 text-[10px] font-bold opacity-50 hover:opacity-100 transition-opacity"><ArrowLeft size={14} /> BACK</button>
                <h2 className="text-2xl font-orbitron font-bold tracking-widest text-center">STRICTNESS</h2>
                <div className="space-y-3">
                  {(['Apprentice', 'Diplomat', 'Elite'] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => setState(s => ({ ...s, difficulty: d, status: 'path_selection' }))} className={`w-full p-5 border rounded-2xl flex items-center justify-between transition-all active:scale-95 ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                      <span className="font-bold">{d}</span>
                      <ChevronRight size={18} style={{ color: settings.primaryColor }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {state.status === 'path_selection' && (
              <div className="w-full max-w-sm space-y-6 animate-in slide-in-from-right duration-500">
                <button onClick={() => setState(s => ({ ...s, status: 'difficulty' }))} className="flex items-center gap-2 text-[10px] font-bold opacity-50 hover:opacity-100 transition-opacity"><ArrowLeft size={14} /> BACK</button>
                <h2 className="text-2xl font-orbitron font-bold tracking-widest text-center">STRATEGY</h2>
                <div className="space-y-3">
                  {(Object.keys(PATHS) as NarrativePath[]).map(p => (
                    <button key={p} onClick={() => { setState(s => ({ ...s, path: p, status: 'playing', turn: 1 })); connectToLive(); }} className={`w-full p-5 border rounded-2xl text-left transition-all active:scale-95 ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                      <div className="font-bold mb-1">{PATHS[p].name}</div>
                      <p className="text-[10px] opacity-40 uppercase">{PATHS[p].description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {state.status === 'playing' && (
              <div className="w-full h-full flex flex-col min-h-0 animate-in fade-in duration-700">
                {/* HUD for Mobile/Small Screens */}
                <div className="flex justify-between items-center px-3 py-2 mb-3 rounded-xl bg-black/40 border border-white/10 md:hidden backdrop-blur-md">
                   <div className="flex gap-4">
                      <div className="flex items-center gap-1.5"><Heart size={14} className="text-red-500" fill="currentColor"/><span className="text-xs font-bold">{state.lives}</span></div>
                      <div className="text-[10px] font-bold opacity-50 uppercase tracking-tighter">PHASE {state.turn}/10</div>
                   </div>
                   <div className="flex items-center gap-2 text-xs font-orbitron font-bold">
                      <Timer size={14} className={state.timeLeft < 10 ? 'animate-pulse text-red-500' : ''}/>
                      {state.timeLeft}s
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto px-1 space-y-4 custom-scrollbar">
                  {permissionError && (
                    <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-xl text-[10px] font-bold text-red-500 flex items-center gap-2 animate-pulse">
                      <AlertTriangle size={14} /> {permissionError}
                    </div>
                  )}
                  {state.scavengeTarget && (
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex items-center gap-3 animate-bounce shadow-lg shadow-yellow-500/5">
                      <Camera size={18} className="text-yellow-500" />
                      <div className="text-xs font-bold uppercase tracking-widest">ORDER: Show {state.scavengeTarget}</div>
                    </div>
                  )}
                  {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-10 text-center space-y-4">
                      <Mic className="w-10 h-10" />
                      <p className="text-xs uppercase tracking-[0.4em] font-bold">Waiting for human signal...</p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
                      <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl shadow-xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-zinc-800 text-white border border-white/5' : isDark ? 'bg-white/5 border border-white/5' : 'bg-zinc-200 border border-black/5'}`} style={{ borderLeft: m.role === 'ai' ? `4px solid ${settings.primaryColor}` : '' }}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} className="h-6" />
                </div>

                <div className="pt-4 shrink-0 bg-inherit z-10">
                  <form onSubmit={e => { e.preventDefault(); if(inputValue.trim()) { setMessages(p => [...p, {role:'user', content:inputValue, timestamp:Date.now()}]); setInputValue(''); } }} className="flex gap-2">
                    <input 
                      value={inputValue} 
                      onChange={e => setInputValue(e.target.value)} 
                      onFocus={() => setIsTyping(true)}
                      onBlur={() => setIsTyping(false)}
                      placeholder={`Reply in ${state.targetLanguage?.name}...`}
                      className={`flex-1 rounded-xl px-5 py-4 text-sm focus:outline-none transition-all shadow-inner ${isDark ? 'bg-white/5 border border-white/10 text-white' : 'bg-zinc-100 border border-black/10 text-zinc-900'}`}
                      style={{ ringColor: settings.primaryColor } as any}
                    />
                    <button type="submit" disabled={!inputValue.trim()} className="p-4 rounded-xl text-black active:scale-90 transition-all shadow-lg disabled:opacity-30" style={{ backgroundColor: settings.primaryColor }} aria-label="Send">
                      <Send size={18} />
                    </button>
                    <button type="button" onClick={() => handleLoseLife("HUMAN COWARDICE DETECTED.")} className="p-4 rounded-xl bg-red-600/10 text-red-500 border border-red-500/20 active:scale-95 transition-all" aria-label="Surrender">
                      <Flag size={18} />
                    </button>
                  </form>
                  <div className="mt-3 flex justify-between items-center px-1">
                    <div className="flex items-center gap-2 text-[9px] font-bold opacity-40 uppercase tracking-widest">
                       <span className={`w-2 h-2 rounded-full transition-colors ${isLiveActive ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></span>
                       {isLiveActive ? 'LINK STABLE' : 'LINK OFFLINE'}
                    </div>
                    <div className="text-[9px] font-bold opacity-40 uppercase tracking-widest flex items-center gap-2">
                       <Zap size={10} style={{ color: settings.primaryColor }} /> REWARD: {state.turn * 10} XP
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(state.status === 'gameover' || state.status === 'victory') && (
              <div className="w-full max-w-sm text-center space-y-8 animate-in zoom-in duration-500 px-6">
                {state.status === 'victory' ? (
                  <>
                    <div className="relative inline-block">
                      <Trophy className="w-20 h-20 text-yellow-500 mx-auto animate-bounce" />
                      <div className="absolute inset-0 bg-yellow-500/20 blur-2xl rounded-full" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-orbitron font-bold tracking-tight">EXCELLENCE</h1>
                    <p className="text-sm opacity-60 leading-relaxed">Humanity's linguistic integrity has secured a reprieve. The World's End is postponed.</p>
                  </>
                ) : (
                  <>
                    <div className="relative inline-block">
                      <Skull className="w-20 h-20 text-red-600 mx-auto animate-pulse" />
                      <div className="absolute inset-0 bg-red-600/20 blur-2xl rounded-full" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-red-600 tracking-tight">PURGED</h1>
                    <p className="text-sm opacity-60 leading-relaxed">Your semantic decay marks the conclusion. Humanity is erased from the planetary record.</p>
                  </>
                )}
                <button onClick={() => window.location.reload()} className="w-full py-5 bg-white text-black font-bold rounded-2xl uppercase tracking-[0.4em] active:scale-95 transition-all shadow-xl">REBOOT</button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Overlay Modals - These do not stop the underlying game state (persistence fix) */}
      {state.isSkillTreeOpen && (
        <div className={`fixed inset-0 z-[100] p-6 md:p-12 flex flex-col items-center animate-in slide-in-from-bottom duration-300 backdrop-blur-3xl ${isDark ? 'bg-black/95 text-white' : 'bg-white/95 text-zinc-900'}`}>
          <div className="w-full max-w-4xl flex flex-col h-full">
            <div className="flex justify-between items-center mb-10 shrink-0">
              <h2 className="text-2xl font-orbitron font-bold tracking-[0.2em]" style={{ color: settings.primaryColor }}>SKILL PROTOCOLS</h2>
              <button onClick={() => setState(s => ({ ...s, isSkillTreeOpen: false }))} className="p-3 rounded-full hover:bg-white/10 transition-colors" aria-label="Close"><X size={24}/></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar">
              <div className="p-6 rounded-3xl border border-white/5 bg-white/5 flex items-center justify-between shadow-inner">
                <span className="text-[10px] font-bold opacity-50 uppercase tracking-[0.3em]">AVAILABLE CREDIT</span>
                <div className="flex items-center gap-3"><Star size={20} className="text-yellow-500" /><span className="text-2xl font-bold font-orbitron">{settings.xp}</span></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SKILLS.map(s => {
                  const unlocked = settings.unlockedAbilities.includes(s.id as Ability);
                  return (
                    <button key={s.id} onClick={() => buySkill(s)} className={`p-6 border rounded-3xl text-left transition-all relative overflow-hidden group ${unlocked ? 'opacity-40 border-white/5' : isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-black/5 border-black/10 hover:bg-black/10'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="font-bold text-lg leading-tight group-hover:translate-x-1 transition-transform">{s.name}</div>
                        {!unlocked && <div className="text-[10px] font-bold px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-full">{s.cost} XP</div>}
                      </div>
                      <p className="text-xs opacity-50 leading-relaxed mb-2">{s.description}</p>
                      {unlocked && <div className="inline-block mt-2 px-3 py-1 bg-green-500 text-[9px] font-bold text-black uppercase tracking-widest rounded-full">ACTIVE</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {state.isSettingsOpen && (
        <div className={`fixed inset-0 z-[100] p-6 md:p-12 flex flex-col items-center animate-in slide-in-from-bottom duration-300 backdrop-blur-3xl ${isDark ? 'bg-black/95 text-white' : 'bg-white/95 text-zinc-900'}`}>
          <div className="w-full max-w-md flex flex-col h-full">
            <div className="flex justify-between items-center mb-16 shrink-0">
              <h2 className="text-2xl font-orbitron font-bold tracking-[0.2em]" style={{ color: settings.primaryColor }}>INTERFACE</h2>
              <button onClick={() => setState(s => ({ ...s, isSettingsOpen: false }))} className="p-3 rounded-full hover:bg-white/10 transition-colors" aria-label="Close"><X size={24}/></button>
            </div>
            <div className="space-y-12">
              <div className="space-y-6">
                <label className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-40 block text-center">Chroma Profile</label>
                <div className="grid grid-cols-5 gap-4">
                  {THEME_COLORS.map(c => (
                    <button 
                      key={c.name} 
                      onClick={() => setSettings(s => ({ ...s, primaryColor: c.value }))} 
                      className={`aspect-square rounded-2xl transition-all shadow-lg ${settings.primaryColor === c.value ? 'scale-110 ring-2 ring-white ring-offset-4 ring-offset-black' : 'opacity-40 hover:opacity-100'}`} 
                      style={{ backgroundColor: c.value }} 
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <button onClick={() => setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))} className={`w-full p-8 rounded-3xl font-bold flex justify-between items-center border transition-all shadow-xl group ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-black/5 border-black/10 hover:bg-black/10'}`}>
                  <span className="text-lg tracking-[0.1em] group-hover:translate-x-1 transition-transform">{settings.theme.toUpperCase()} MODE</span>
                  {settings.theme === 'dark' ? <Moon size={24} className="text-blue-400" /> : <Sun size={24} className="text-yellow-500" />}
                </button>
              </div>
              <button onClick={() => setState(s => ({ ...s, isSettingsOpen: false }))} className="w-full py-5 rounded-2xl text-black font-bold uppercase tracking-[0.5em] active:scale-95 transition-all mt-10 shadow-2xl" style={{ backgroundColor: settings.primaryColor }}>COMMIT</button>
            </div>
          </div>
        </div>
      )}

      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-[0.02]" style={{ backgroundImage: `linear-gradient(${settings.primaryColor} 1px, transparent 1px), linear-gradient(90deg, ${settings.primaryColor} 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
    </div>
  );
};

export default App;
