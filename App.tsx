
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Blob } from '@google/genai';

// Helper functions for audio processing
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  
  const audioContexts = useRef<{
    input: AudioContext;
    output: AudioContext;
    inputNode: GainNode;
    outputNode: GainNode;
  } | null>(null);
  
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stopAllAudio = () => {
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const createBlob = (data: Float32Array): Blob => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const startConnection = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const inputNode = inputCtx.createGain();
      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);
      
      audioContexts.current = { input: inputCtx, output: outputCtx, inputNode, outputNode };

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } }, // Mature male British vibe
          },
          systemInstruction: 'command synchron\n\nYou are "synchron". You are a sophisticated, mature male entity with a British accent. You are calm, precise, and helpful. You prefer concise but meaningful dialogue. When the session starts, briefly acknowledge the user as synchron.',
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Audio data
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContexts.current) {
              const { output, outputNode } = audioContexts.current;
              setIsSpeaking(true);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, output.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), output, 24000, 1);
              
              const source = output.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              });
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Transcription
            if (message.serverContent?.outputTranscription) {
               setTranscript(prev => prev + ' ' + message.serverContent?.outputTranscription?.text);
            }

            // Interruptions
            if (message.serverContent?.interrupted) {
              stopAllAudio();
              setIsSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error('Synchron Connection Error:', e);
            setError('Communication link severed. Please retry.');
            setIsConnected(false);
          },
          onclose: () => {
            setIsConnected(false);
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to initialize Synchron interface.');
    }
  };

  const toggleConnection = () => {
    if (isConnected) {
      sessionRef.current?.close();
      setIsConnected(false);
      stopAllAudio();
    } else {
      startConnection();
    }
  };

  return (
    <div className="flex flex-col items-center justify-between h-screen w-full bg-black text-white p-6 md:p-12 overflow-hidden select-none">
      {/* Branding */}
      <div className="w-full flex justify-between items-start pt-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-light tracking-[0.3em] uppercase opacity-90">Synchron</h1>
          <div className="h-[1px] w-12 bg-white/30 mt-1"></div>
        </div>
        <div className="text-[10px] tracking-widest uppercase opacity-40 text-right leading-relaxed">
          Operational Mode: Live<br/>
          Voice Matrix: Mature Male (UK)
        </div>
      </div>

      {/* Central Circular Interface */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="relative flex items-center justify-center">
          {/* Pulsing rings when connected */}
          {isConnected && (
            <>
              <div className="absolute w-64 h-64 border border-white/5 rounded-full pulse-ring"></div>
              <div className="absolute w-80 h-80 border border-white/5 rounded-full pulse-ring" style={{ animationDelay: '0.5s' }}></div>
            </>
          )}

          {/* Main Orb */}
          <button 
            onClick={toggleConnection}
            className={`
              relative z-10 w-48 h-48 md:w-64 md:h-64 rounded-full flex flex-col items-center justify-center transition-all duration-700 ease-in-out cursor-pointer group
              ${isConnected ? 'bg-transparent border border-white/20 orb-glow' : 'bg-white/5 border border-white/10 hover:bg-white/10'}
              ${isSpeaking ? 'orb-active border-white/40' : ''}
            `}
          >
            {/* Visual Feedback Inside Orb */}
            {!isConnected ? (
              <div className="flex flex-col items-center gap-4 group-hover:scale-105 transition-transform">
                <div className="w-12 h-12 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" x2="12" y1="19" y2="22"></line>
                  </svg>
                </div>
                <span className="text-[10px] tracking-[0.2em] uppercase opacity-60">Initiate Link</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className={`w-1 h-1 rounded-full bg-white transition-all duration-500 ${isSpeaking ? 'scale-[20] blur-[1px] opacity-40' : 'scale-100 opacity-100'}`}></div>
                <span className={`text-[9px] tracking-[0.3em] uppercase absolute bottom-12 transition-opacity duration-500 ${isSpeaking ? 'opacity-20' : 'opacity-60'}`}>
                  {isSpeaking ? 'Speaking' : 'Listening'}
                </span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Footer / Status Area */}
      <div className="w-full max-w-sm flex flex-col gap-6 mb-8 text-center">
        {error ? (
          <div className="text-red-400 text-xs font-light tracking-wide animate-pulse">
            {error}
          </div>
        ) : !isConnected ? (
          <p className="text-neutral-500 text-xs leading-relaxed tracking-wide px-4">
            Welcome. Please engage your microphone to establish a connection with Synchron.
          </p>
        ) : (
          <div className="h-4 overflow-hidden">
            <p className="text-white/40 text-[10px] italic font-light truncate">
              {transcript || "Synchron is standing by..."}
            </p>
          </div>
        )}
        
        {isConnected && (
            <button 
              onClick={toggleConnection}
              className="text-white/20 hover:text-white/50 text-[10px] uppercase tracking-[0.2em] transition-colors"
            >
              Terminate Session
            </button>
        )}
      </div>
    </div>
  );
};

export default App;
