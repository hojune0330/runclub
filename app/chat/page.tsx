'use client';

import { useChat } from 'ai/react';
import { Send, User, Bot, Loader2 } from 'lucide-react';
import { useRef, useEffect } from 'react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: '/chat/calmcode',
    });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
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
              onChange={handleInputChange}
              placeholder="メッセージを入力..."
              rows={1}
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim()) {
                    handleSubmit(e as any);
                  }
                }
              }}
              style={{ minHeight: '42px', maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
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
