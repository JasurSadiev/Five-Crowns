import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessage } from '../../types/game';
import { Avatar, Button } from '../common';
import { formatTime } from '../../utils/formatting';
import { clampMessage } from '../../utils/validation';
import { useToast } from '../../hooks/useToast';
import { cn } from '../../utils/cn';

export function ChatPanel({
  messages,
  onSend,
  selfUid,
  disabled,
  placeholder = 'Say something…',
  emptyLabel = 'No messages yet. Say hello!',
  className,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<void>;
  selfUid: string | null;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}): JSX.Element {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const value = clampMessage(text);
    if (!value || sending) return;
    setSending(true);
    try {
      await onSend(value);
      setText('');
    } catch (error) {
      toast.error(error, 'Message not sent');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">{emptyLabel}</p>
        ) : (
          messages.map((message) =>
            message.system ? (
              <p key={message.id} className="text-center text-xs italic text-ink-faint">
                {message.text}
              </p>
            ) : (
              <div
                key={message.id}
                className={cn('flex gap-2', message.uid === selfUid && 'flex-row-reverse')}
              >
                <Avatar name={message.displayName} src={message.photoURL} size={28} />
                <div
                  className={cn(
                    'max-w-[78%] rounded-2xl px-3 py-2',
                    message.uid === selfUid
                      ? 'rounded-tr-sm bg-felt-600/80 text-white'
                      : 'rounded-tl-sm bg-ink/5 text-ink dark:bg-white/5',
                  )}
                >
                  {message.uid !== selfUid ? (
                    <p className="text-[11px] font-semibold text-gold-300">{message.displayName}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
                  <p
                    className={cn(
                      'mt-0.5 text-[10px]',
                      message.uid === selfUid ? 'text-white/50' : 'text-ink-faint',
                    )}
                  >
                    {formatTime(message.createdAt)}
                  </p>
                </div>
              </div>
            ),
          )
        )}
      </div>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="chat-input">
          Message
        </label>
        <input
          id="chat-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={disabled ? 'Chat is disabled for this table' : placeholder}
          disabled={disabled}
          maxLength={240}
          className="h-10 flex-1 rounded-xl border border-line bg-surface-raised/60 px-3 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 disabled:opacity-50"
        />
        <Button
          type="submit"
          size="sm"
          disabled={disabled || !text.trim()}
          loading={sending}
          icon={<Send className="h-4 w-4" />}
          aria-label="Send message"
          className="px-3"
        >
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
