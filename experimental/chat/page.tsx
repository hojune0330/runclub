'use client';

import { Send, User, Bot, Loader2 } from 'lucide-react';
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = { id: createId(), role: 'user', content: text };
    const assistantId = createId();
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setIsLoading(true);
    setError(false);

    try {
      const res = await fetch('/chat/calmcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Chat request failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let content = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        content += decoder.decode(value, { stream: true });
        setMessages(current => current.map(message => (
          message.id === assistantId ? { ...message, content } : message
        )));
      }
      content += decoder.decode();
      setMessages(current => current.map(message => (
        message.id === assistantId ? { ...message, content: content || '응답이 비어 있습니다.' } : message
      )));
    } catch (err) {
      console.error('[experimental chat] send failed', err);
      setError(true);
      setMessages(current => current.filter(message => message.id !== assistantId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-116px)] md:h-[calc(100vh-120px)] max-w-[720px] mx-auto">
      {/* Header */}
      <div className="shrink-0 px-3 md:px-0 py-4 border-b border-[var(--color-border)] bg-white">
        <h1 className="page-title">Calmcode AI チャット</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          AIアシスタントに質問して、すぐに回答を得られます。
        </p>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 md:px-0 py-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-full bg-[var(--color-primary-bg)] flex items-center justify-center mb-3">
              <Bot size={22} className="text-[var(--color-primary)]" />
            </div>
            <p className="text-[14px] font-medium text-[var(--color-text)] mb-1">
              Calmcode AI へようこそ
            </p>
            <p className="text-[12.5px] text-[var(--color-text-muted)] max-w-[320px] leading-relaxed">
              下の入力欄から質問を送信してください。AIがリアルタイムで回答します。
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-3 ${
              m.role === 'user' ? 'justify-end' : ''
            }`}
          >
            {m.role !== 'user' && (
              <div className="w-7 h-7 rounded-full bg-[var(--color-primary-bg)] flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-[var(--color-primary)]" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-white border border-[var(--color-border)] text-[var(--color-text)]'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.content || '작성 중...'}</p>
            </div>

            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-[var(--color-text-secondary)]" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[var(--color-primary-bg)] flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={14} className="text-[var(--color-primary)]" />
            </div>
            <div className="bg-white border border-[var(--color-border)] rounded-lg px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-[12.5px]">考え中...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[var(--color-danger-bg)] flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={14} className="text-[var(--color-danger)]" />
            </div>
            <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-lg px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
              エラーが発生しました。しばらくしてからもう一度お試しください。
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 px-3 md:px-0 py-3 border-t border-[var(--color-border)] bg-white">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder="メッセージを入力..."
              rows={1}
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-colors"
              onKeyDown={handleKeyDown}
              style={{ minHeight: '42px', maxHeight: '120px' }}
              onInput={(event) => {
                const target = event.currentTarget;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
