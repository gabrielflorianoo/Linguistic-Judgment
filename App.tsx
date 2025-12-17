
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type } from '@google/genai';
import { Eye } from './components/Eye';
import { GameState, Message, Language, PersonaType, Difficulty, GameSettings, NarrativePath, Ability } from './types';
import { LANGUAGES, PERSONAS, PATHS, SKILLS, INITIAL_LIVES, WINNING_TURNS, DIFFICULTY_CONFIG, THEME_COLORS, SURRENDER_PHRASES, XP_PER_TURN } from './constants';
import { 
  Terminal as TerminalIcon, Heart, Timer, Target, AlertTriangle, 
  Play, RefreshCw, Trophy, Skull, Settings, HelpCircle, X,
  Sun, Moon, Zap, ArrowLeft, Flag, Mic, MicOff, Ghost, Info, Send, Camera, BookOpen, Star
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
    const saved = localStorage.getItem('worldsend-v2-settings');
    if (saved) return JSON.parse(saved);
    return {
      primaryColor: '#00ff41',
      theme: 'light', // Changed default theme to light
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
  const [showTutorial, setShowTutorial] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [ironicPhrase, setIronicPhrase] = useState('');
  const [lookAt, setLookAt] = useState({ x: 0, y: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aiRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const audioCtxRefs = useRef<{input?: AudioContext, output?: AudioContext}>({});
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptionRef = useRef<{ user: string; model: string }>({ user: '', model: '' });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('worldsend-v2-settings', JSON.stringify(settings));
  }, [settings]);

  const handleLoseLife = useCallback((reason: string) => {
    if (settings.unlockedAbilities.includes('Grammar Shield')) {
      setSettings(s => ({ ...s, unlockedAbilities: s.unlockedAbilities.filter(a => a !== 'Grammar Shield') }));
      setMessages(prev => [...prev, { role: 'ai', content: "SHIELD ACTIVATED. LINGUISTIC BLUNDER NEUTRALIZED.", timestamp: Date.now() }]);
      return;
    }
    setIsAngry(true);
    setTimeout(() => setIsAngry(false), 3000);
    setState(prev => {
      const nl = prev.lives - 1;
      return nl <= 0 ? { ...prev, lives: 0, status: 'gameover' } : { ...prev, lives: nl };
    });
    setMessages(prev => [...prev, { role: 'ai', content: reason, isError: true, timestamp: Date.now() }]);
  }, [settings.unlockedAbilities]);

  const connectToLive = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRefs.current = { input: inCtx, output: outCtx };

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) videoRef.current.srcObject = camStream;

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

            setInterval(() => {
              if (videoRef.current && canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                ctx?.drawImage(videoRef.current, 0, 0, 320, 240);
                canvasRef.current.toBlob(blob => {
                  if (blob) {
                    blob.arrayBuffer().then(ab => {
                      sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encode(new Uint8Array(ab)), mimeType: 'image/jpeg' } }));
                    });
                  }
                }, 'image/jpeg', 0.5);
              }
            }, 2000);
          },
          onmessage: async (m: LiveServerMessage) => {
            if (m.toolCall) {
              for (const fc of m.toolCall.functionCalls) {
                if (fc.name === 'update_game_state') {
                  const { tension_delta, persona_shift, xp_gain, scavenge_item } = fc.args;
                  setState(s => ({
                    ...s,
                    tension: Math.min(100, Math.max(0, s.tension + (tension_delta || 0))),
                    persona: persona_shift || s.persona,
                    scavengeTarget: scavenge_item || s.scavengeTarget
                  }));
                  setSettings(s => ({ ...s, xp: s.xp + (xp_gain || 0) }));
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "OK" } } }));
                }
              }
            }
            if (m.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              const audio = await decodeAudioData(decode(m.serverContent.modelTurn.parts[0].inlineData.data), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = audio;
              source.connect(outCtx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current = Math.max(outCtx.currentTime, nextStartTimeRef.current) + audio.duration;
              sourcesRef.current.add(source);
            }
            if (m.serverContent?.turnComplete) {
              setState(s => ({ ...s, turn: s.turn + 1, timeLeft: DIFFICULTY_CONFIG[s.difficulty].time }));
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
    if (state.status === 'playing') {
      timerRef.current = setInterval(() => {
        setState(s => {
          if (s.timeLeft <= 0) { handleLoseLife("TIME IS EXPIRED."); return { ...s, timeLeft: DIFFICULTY_CONFIG[s.difficulty].time }; }
          return { ...s, timeLeft: s.timeLeft - 1 };
        });
      }, 1000);
    } else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.status, handleLoseLife]);

  const isDark = settings.theme === 'dark';

  return (
    <div className={`flex flex-col min-h-screen p-4 md:p-8 font-mono transition-all duration-500 overflow-hidden ${isDark ? 'bg-[#050505] text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`} style={{ '--primary-color': settings.primaryColor } as any}>
      
      {/* Background FX based on Tension */}
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-[0.05]" style={{ backgroundImage: `radial-gradient(circle, ${settings.primaryColor} 1px, transparent 1px)`, backgroundSize: '40px 40px', filter: `blur(${state.tension/10}px)` }} />
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 relative z-50">
        <div className="flex items-center gap-3" style={{ color: settings.primaryColor }}>
          <TerminalIcon className="animate-pulse" />
          <h1 className="font-orbitron font-bold text-lg tracking-[0.2em] uppercase">TRIAL v2.5.0</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
            <Star size={16} className="text-yellow-500" />
            <span className="text-xs font-bold">{settings.xp} XP</span>
          </div>
          <button onClick={() => setState(s => ({ ...s, isSkillTreeOpen: !s.isSkillTreeOpen }))} className={`p-2 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}><BookOpen size={20} /></button>
          <button onClick={() => setState(s => ({ ...s, isSettingsOpen: !s.isSettingsOpen }))} className={`p-2 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}><Settings size={20} /></button>
        </div>
      </div>

      <main className="flex-1 flex flex-col md:flex-row gap-8 min-h-0 relative">
        {/* Visual Anchor */}
        <div className="flex flex-col items-center justify-center shrink-0">
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
          <div className={`mt-8 relative overflow-hidden w-40 h-30 rounded-xl border shadow-2xl ${isDark ? 'border-white/10 bg-black' : 'border-black/10 bg-zinc-200'}`}>
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover opacity-60" />
            <canvas ref={canvasRef} className="hidden" width="320" height="240" />
            <div className="absolute inset-0 border-2 border-red-500/20 pointer-events-none" />
          </div>
          {state.status === 'playing' && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="text-[10px] uppercase font-bold tracking-widest opacity-40">Tension Level</div>
              <div className={`w-48 h-2 rounded-full overflow-hidden border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                <div className="h-full transition-all duration-500" style={{ width: `${state.tension}%`, backgroundColor: state.tension > 70 ? '#ff3131' : settings.primaryColor }} />
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className={`flex-1 flex flex-col border rounded-3xl overflow-hidden backdrop-blur-xl transition-all shadow-2xl ${isDark ? 'bg-black/60' : 'bg-white/80'}`} style={{ borderColor: `${settings.primaryColor}22` }}>
          
          {state.status === 'start' && (
            <div className="flex-1 flex flex-col p-10 items-center justify-center space-y-12 animate-in fade-in">
              <div className="text-center space-y-4">
                <h2 className="text-5xl font-orbitron font-bold tracking-tighter" style={{ color: settings.primaryColor }}>THE PROTOCOL</h2>
                <p className="text-sm opacity-50 max-w-sm mx-auto">Language is the only proof of civilization. Choose your target protocol.</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-2xl">
                {LANGUAGES.map(l => (
                  <button key={l.code} onClick={() => setState(s => ({ ...s, targetLanguage: l, status: 'difficulty' }))} className={`p-6 border rounded-2xl transition-all text-left ${isDark ? 'border-white/5 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-black/5 hover:bg-black/10'}`}>
                    <div className="text-[10px] uppercase tracking-widest mb-1 opacity-60 font-bold" style={{ color: settings.primaryColor }}>{l.name}</div>
                    <div className="text-lg font-bold">{l.nativeName}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.status === 'difficulty' && (
            <div className="flex-1 flex flex-col p-10 items-center justify-center space-y-10 animate-in slide-in-from-right-4">
              <h2 className="text-3xl font-orbitron font-bold tracking-widest" style={{ color: settings.primaryColor }}>DIFFICULTY SCALE</h2>
              <div className="grid grid-cols-1 w-full max-w-sm gap-4">
                {(['Apprentice', 'Diplomat', 'Elite'] as Difficulty[]).map(d => (
                  <button key={d} onClick={() => setState(s => ({ ...s, difficulty: d, status: 'path_selection' }))} className={`p-6 border rounded-2xl flex items-center justify-between transition-all ${isDark ? 'border-white/5 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-black/5 hover:bg-black/10'}`}>
                    <span className="font-bold text-lg">{d}</span>
                    <Zap size={20} style={{ color: settings.primaryColor }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.status === 'path_selection' && (
            <div className="flex-1 flex flex-col p-10 items-center justify-center space-y-8 animate-in slide-in-from-right-4">
              <h2 className="text-3xl font-orbitron font-bold tracking-widest" style={{ color: settings.primaryColor }}>NARRATIVE PATH</h2>
              <div className="grid grid-cols-1 w-full max-w-md gap-4">
                {(Object.keys(PATHS) as NarrativePath[]).map(p => (
                  <button key={p} onClick={() => { setState(s => ({ ...s, path: p, status: 'playing', turn: 1 })); connectToLive(); }} className={`p-6 border rounded-2xl text-left transition-all ${isDark ? 'border-white/5 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-black/5 hover:bg-black/10'}`}>
                    <div className="font-bold text-xl mb-1">{PATHS[p].name}</div>
                    <p className="text-xs opacity-50">{PATHS[p].description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.status === 'playing' && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div className={`flex justify-between items-center p-6 border-b ${isDark ? 'border-white/5 bg-black/20' : 'border-black/5 bg-zinc-100'}`}>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2"><Heart className="text-red-500" size={16} fill="currentColor" /> <span className="text-sm font-bold">{state.lives}</span></div>
                  <div className={`flex items-center gap-2 uppercase tracking-widest text-[10px] font-bold ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}><Target size={14} /> PHASE {state.turn}/10</div>
                </div>
                <div className="flex items-center gap-3 font-orbitron font-bold text-lg">
                  <Timer size={20} className={state.timeLeft < 10 ? 'animate-bounce text-orange-500' : ''} />
                  {state.timeLeft}s
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {state.scavengeTarget && (
                  <div className="p-6 bg-yellow-500/10 border-2 border-yellow-500/30 rounded-3xl flex items-center gap-4 animate-bounce">
                    <Camera className="text-yellow-500" />
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest">SCAVENGE ORDER:</div>
                      <div className="text-lg font-bold">Show the Arbiter: {state.scavengeTarget}</div>
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in`}>
                    <div className={`max-w-[85%] p-5 rounded-3xl shadow-xl ${m.role === 'user' ? 'bg-zinc-800 text-white' : isDark ? 'bg-white/5 border border-white/10' : 'bg-black/5 border border-black/10'}`} style={{ borderLeft: m.role === 'ai' ? `4px solid ${settings.primaryColor}` : '' }}>
                      <p className="text-sm leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className={`p-6 border-t ${isDark ? 'bg-black/40 border-white/10' : 'bg-zinc-100 border-black/10'}`}>
                <form onSubmit={(e) => { e.preventDefault(); setInputValue(''); }} className="flex gap-4">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Type to negotiate..." className={`flex-1 border rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-1 transition-all ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-black/10 text-black'}`} style={{ ringColor: settings.primaryColor } as any} />
                  <button type="submit" className="p-4 rounded-2xl text-black font-bold shadow-xl transition-transform active:scale-95" style={{ backgroundColor: settings.primaryColor }}><Send size={20} /></button>
                </form>
              </div>
            </div>
          )}

          {/* Skill Tree Modal */}
          {state.isSkillTreeOpen && (
            <div className={`absolute inset-0 z-[100] backdrop-blur-3xl p-12 flex flex-col items-center animate-in zoom-in ${isDark ? 'bg-black/90 text-white' : 'bg-white/95 text-zinc-900'}`}>
              <button onClick={() => setState(s => ({ ...s, isSkillTreeOpen: false }))} className={`absolute top-8 right-8 p-2 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}><X /></button>
              <h2 className="text-4xl font-orbitron font-bold mb-12 tracking-widest" style={{ color: settings.primaryColor }}>SKILL PROTOCOLS</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {SKILLS.map(s => {
                  const unlocked = settings.unlockedAbilities.includes(s.id as Ability);
                  return (
                    <button key={s.id} onClick={() => buySkill(s)} className={`p-8 border rounded-3xl text-left transition-all ${unlocked ? 'opacity-40 border-white/10' : isDark ? 'hover:scale-105 border-white/5 bg-white/5' : 'hover:scale-105 border-black/5 bg-black/5'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="text-2xl font-bold">{s.name}</div>
                        {!unlocked && <div className="bg-yellow-500/20 text-yellow-500 text-[10px] px-3 py-1 rounded-full font-bold">{s.cost} XP</div>}
                      </div>
                      <p className="text-sm opacity-60 mb-4">{s.description}</p>
                      {unlocked && <div className="text-[10px] text-green-500 font-bold uppercase tracking-widest">ENABLED</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Settings Modal */}
          {state.isSettingsOpen && (
            <div className={`absolute inset-0 z-[100] backdrop-blur-3xl p-12 flex flex-col items-center animate-in zoom-in ${isDark ? 'bg-black/95 text-white' : 'bg-white/95 text-zinc-900'}`}>
              <button onClick={() => setState(s => ({ ...s, isSettingsOpen: false }))} className={`absolute top-8 right-8 p-2 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}><X /></button>
              <h2 className="text-4xl font-orbitron font-bold mb-12 tracking-widest" style={{ color: settings.primaryColor }}>INTERFACE CORE</h2>
              <div className="w-full max-w-md space-y-12">
                <div className="space-y-4">
                  <label className="text-xs uppercase tracking-[0.3em] font-bold opacity-60">Chromatic Spectrum</label>
                  <div className="grid grid-cols-5 gap-4">
                    {THEME_COLORS.map(c => (
                      <button key={c.name} onClick={() => setSettings(s => ({ ...s, primaryColor: c.value }))} className={`aspect-square rounded-2xl transition-all shadow-md ${settings.primaryColor === c.value ? 'scale-115 border-4 border-white ring-4 ring-black/10' : 'opacity-60 hover:opacity-100'}`} style={{ backgroundColor: c.value }} />
                    ))}
                  </div>
                </div>
                <button onClick={() => setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))} className={`w-full p-8 rounded-3xl font-bold text-xl flex justify-between items-center group transition-all border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                  {settings.theme.toUpperCase()} MODE
                  {settings.theme === 'dark' ? <Moon className="text-blue-400" /> : <Sun className="text-yellow-500" />}
                </button>
                <button onClick={() => setState(s => ({ ...s, isSettingsOpen: false }))} className="w-full py-5 rounded-2xl text-black font-bold uppercase tracking-[0.2em] shadow-xl transition-transform active:scale-95" style={{ backgroundColor: settings.primaryColor }}>Apply Protocols</button>
              </div>
            </div>
          )}

          {(state.status === 'gameover' || state.status === 'surrender') && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-8 text-center animate-in zoom-in">
              <Skull className="w-24 h-24 text-red-600 animate-pulse" />
              <h1 className="text-7xl font-orbitron font-bold uppercase text-red-600">EXTINCT</h1>
              <p className="text-xl max-w-lg opacity-60 italic">"{ironicPhrase || "Your syntax was your downfall."}"</p>
              <button onClick={() => window.location.reload()} className="px-12 py-5 bg-white text-black font-bold rounded-2xl uppercase tracking-widest hover:scale-110 transition-all shadow-2xl">REBOOT SYSTEM</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
