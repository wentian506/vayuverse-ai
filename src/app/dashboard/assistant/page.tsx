'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  MessageSquarePlus,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { PageHeader, ProvenanceBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { ProvenanceClass } from '@/lib/types';
import { cn, formatIstTime } from '@/lib/utils';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; classification: ProvenanceClass; timestamp: string; location: string }[];
  reasoning?: Record<string, unknown>;
  model_used?: string;
  created_at?: string;
}

interface Thread {
  thread_id: string;
  title: string;
  updated_at: string;
  messages: ChatMsg[];
}

const SUGGESTED_PROMPTS = [
  'Summarise current air quality and the cleanest 24h forecast window.',
  'Build a practical daily action plan for my commute, workout, and ventilation.',
  'Summarise recent community pollution reports in my city.',
  'What is the exact PM2.5 inside my bedroom or on my exact street?',
  'आज की वायु गुणवत्ता और बेहतर समय हिंदी में बताएं।',
  'ਅੱਜ ਦੀ ਹਵਾ ਗੁਣਵੱਤਾ ਅਤੇ ਸੈਰ ਦਾ ਸਹੀ ਸਮਾਂ ਪੰਜਾਬੀ ਵਿੱਚ ਦੱਸੋ।',
];

export default function AssistantPage() {
  const { selectedCity, language, toast } = useApp();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [claudeLive, setClaudeLive] = useState(false);
  const [listening, setListening] = useState(false);
  const [openReasoning, setOpenReasoning] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/assistant/threads', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setClaudeLive(Boolean(data.claude_api_live));
      const list: Thread[] = data.threads || [];
      setThreads(list);
      if (!activeThreadId && list.length > 0) {
        setActiveThreadId(list[0].thread_id);
        setMessages(list[0].messages);
      }
    } catch {
      // handled in send
    }
  }, [activeThreadId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const optimistic: ChatMsg = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/v1/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: trimmed,
          thread_id: activeThreadId,
          city: selectedCity,
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Assistant unavailable.');
      setActiveThreadId(data.thread_id);
      setMessages((prev) => [...prev, data.message]);
      loadThreads();
    } catch (e) {
      toast('error', 'Assistant notice', e instanceof Error ? e.message : 'Could not complete request.');
    } finally {
      setSending(false);
    }
  };

  // Multilingual Voice Input (Web Speech API — MVP Multilingual Voice Assistant)
  const toggleVoiceInput = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => { lang: string; onresult: (ev: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void; onend: () => void; onerror: () => void; start: () => void };
      webkitSpeechRecognition?: new () => { lang: string; onresult: (ev: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void; onend: () => void; onerror: () => void; start: () => void };
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast('info', 'Voice recognition unsupported in this browser', 'Try Chrome or Edge for live microphone speech-to-text.');
      return;
    }
    const rec = new SR();
    rec.lang = language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : 'en-IN';
    setListening(true);
    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript || '';
      if (transcript) setInput(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const speakMessage = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[#*`]/g, '');
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : 'en-IN';
    window.speechSynthesis.speak(utter);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Response Agent & Multilingual Voice Assistant"
        subtitle={`Grounded explanations, forecast summaries, routine plans, and community digests for ${selectedCity} in English, हिन्दी, and ਪੰਜਾਬੀ — with full source citations and reasoning audit.`}
        badge="MVP"
        provenance="AI SUMMARY"
        actions={
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-vayu-cyan">
            {claudeLive ? 'Claude API Connected' : 'Grounded Evidence Mode (Claude-ready)'}
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Conversation History Sidebar */}
        <div className="vayu-card p-4 lg:col-span-3 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveThreadId(null);
              setMessages([]);
            }}
            className="vayu-btn-primary w-full py-2 text-xs"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> New Conversation
          </button>

          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">History</p>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {threads.length === 0 ? (
              <p className="text-xs text-slate-500">Your saved grounded conversations appear here.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.thread_id}
                  type="button"
                  onClick={() => {
                    setActiveThreadId(t.thread_id);
                    setMessages(t.messages);
                  }}
                  className={cn(
                    'w-full rounded-xl p-2.5 text-left text-xs transition',
                    activeThreadId === t.thread_id
                      ? 'bg-vayu-electric/25 text-white ring-1 ring-vayu-cyan/40'
                      : 'bg-white/[0.02] text-slate-300 hover:bg-white/[0.06]'
                  )}
                >
                  <p className="truncate font-semibold">{t.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{formatIstTime(t.updated_at)}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Pane */}
        <div className="vayu-card flex flex-col lg:col-span-9 min-h-[560px]">
          <div className="flex-1 space-y-4 overflow-y-auto p-5 max-h-[500px]">
            {messages.length === 0 ? (
              <div className="py-8 text-center space-y-5">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-vayu-electric/20 ring-1 ring-vayu-cyan/40">
                  <Bot className="h-7 w-7 text-vayu-cyan" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-white">
                    Ask VAYUVERSE AI About {selectedCity}
                  </h2>
                  <p className="mt-1 mx-auto max-w-lg text-xs text-slate-400">
                    Every response retrieves live environmental telemetry, cites its exact provenance classification, and states openly whenever granular or medical data is outside scope.
                  </p>
                </div>
                <div className="grid gap-2.5 text-left sm:grid-cols-2 max-w-2xl mx-auto">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => sendMessage(p)}
                      className="rounded-xl border border-white/10 bg-[#071224] p-3 text-xs text-slate-200 transition hover:border-vayu-cyan/45 hover:text-white"
                    >
                      <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-vayu-cyan" />
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex flex-col',
                    m.role === 'user' ? 'items-end' : 'items-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-2xl rounded-2xl p-4 text-xs leading-relaxed',
                      m.role === 'user'
                        ? 'bg-gradient-to-r from-vayu-electric to-[#2563EB] text-white'
                        : 'border border-white/10 bg-[#071326] text-slate-100 space-y-3'
                    )}
                  >
                    <div className="whitespace-pre-line">{m.content}</div>

                    {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                      <div className="border-t border-white/10 pt-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-1 font-mono text-[10px] uppercase text-slate-400">
                            <ShieldCheck className="h-3.5 w-3.5 text-vayu-teal" /> Grounded Source References
                          </span>
                          <button
                            type="button"
                            onClick={() => speakMessage(m.content)}
                            className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-[10px] text-vayu-cyan hover:bg-white/10"
                          >
                            <Volume2 className="h-3 w-3" /> Read Aloud
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {m.sources.map((s, idx) => (
                            <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[10.5px]">
                              <span className="text-slate-200">{s.title} ({s.location})</span>
                              <ProvenanceBadge type={s.classification} compact />
                            </div>
                          ))}
                        </div>

                        {m.reasoning && (
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenReasoning((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                              }
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-vayu-cyan"
                            >
                              <ChevronDown
                                className={cn('h-3 w-3 transition', openReasoning[m.id] && 'rotate-180')}
                              />
                              Inspect Reasoning Inputs &amp; Engine ({m.model_used})
                            </button>
                            {openReasoning[m.id] && (
                              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-2.5 font-mono text-[10px] text-vayu-cyan">
                                {JSON.stringify(m.reasoning, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[#071326] px-4 py-3 text-xs text-vayu-cyan">
                <span className="h-2 w-2 animate-ping rounded-full bg-vayu-cyan" />
                Retrieving live {selectedCity} telemetry &amp; verifying provenance...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-2 border-t border-white/10 p-4"
          >
            <button
              type="button"
              onClick={toggleVoiceInput}
              aria-label="Voice input"
              className={cn(
                'rounded-xl border p-2.5 transition',
                listening
                  ? 'border-vayu-teal bg-vayu-teal/20 text-vayu-teal animate-pulse'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:text-white'
              )}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${selectedCity} AQI, forecasts, routines, or community reports...`}
              className="vayu-input flex-1 text-xs"
            />
            <button type="submit" disabled={sending || !input.trim()} className="vayu-btn-primary px-4 py-2.5 text-xs">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
