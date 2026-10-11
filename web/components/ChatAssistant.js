// The chat assistant: a round button in the bottom-right corner that opens a small chat window above it.
//
// The button carries the assistant's own mark (AssistantMark below): a speech bubble with a gold leaf in it, in the
// brand's deep green and gold, so it reads as part of the shop rather than a bolted-on widget. On a phone it floats above
// the tab bar, and above the product page's buy bar when that is on screen; the back-to-top button sits just above it
// (styles/globals.css, --fb-float-bottom).
//
// The window does not cover the page (it is not modal), so a visitor can keep browsing with it open. Esc or the close
// button closes it and puts focus back on the button. The conversation survives closing, moving between pages and
// reloading (it is kept for this browser tab only); "Start a new chat" clears it. On a phone, where the window fills most
// of the screen, following a link closes it.
//
// Answers come from lib/assistant.js: frequent questions instantly from content/assistant.js, the rest from the AI through
// pages/api/assistant.js (docs/CHATBOT.md). AI answers carry a small "AI answer" label. The catalogue is only loaded once
// the window is opened, so the button costs nothing on pages where nobody chats.

import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ArrowUp, ChevronDown, RotateCcw, Sparkles, X } from 'lucide-react';
import OptimizedImage from '@/components/OptimizedImage';
import { ASSISTANT, SUGGESTIONS } from '@/content/assistant';
import { BUSINESS } from '@/content/business';
import { askAssistant, forgetAnswers, historyFor } from '@/lib/assistant';
import { useProducts } from '@/lib/catalog';

const MIN_REPLY_MS = 450; // a short pause, so an instant answer reads as a reply rather than flashing in
const PHONE_QUERY = '(max-width: 767px)';
const MAX_INPUT = 500;
const STORE_KEY = 'fb-assistant-chat';
const STORE_MAX = 40; // messages kept across reloads

// The assistant's mark: a speech bubble (in the current text colour) holding a gold leaf.
export function AssistantMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path
        d="M16 4.75c-6.49 0-11.25 4.33-11.25 9.86 0 2.62 1.07 4.99 2.88 6.75l-1.13 5.39 5.6-2.53c1.21.37 2.52.57 3.9.57 6.49 0 11.25-4.33 11.25-10.18S22.49 4.75 16 4.75Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path d="M11 19.6c0-5 3.6-8.35 9.9-8.35 0 5.5-3.45 8.85-8.3 8.85-.55 0-1.1-.17-1.6-.5Z" fill="var(--fb-gold-bright)" />
      <path d="M12 18.9c1.8-2.35 3.8-3.95 6.1-5.05" stroke="var(--fb-hero-deep)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BotAvatar() {
  return (
    <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-hero-mid to-hero-deep text-on-hero ring-1 ring-gold-bright/50">
      <AssistantMark size={17} />
    </span>
  );
}

// **bold** inside a line. Plain text otherwise: nothing from an answer is ever treated as HTML.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// An answer's text: paragraphs, and lines starting with "- " or "* " as a bulleted list.
export function FormattedText({ text }) {
  const blocks = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === 'ul') last.items.push(bullet[1]);
      else blocks.push({ type: 'ul', items: [bullet[1]] });
    } else {
      blocks.push({ type: 'p', text: line });
    }
  }
  return (
    <div className="grid gap-1.5">
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b.text)}</p>
        ),
      )}
    </div>
  );
}

// The products a reply suggests: photo, name, category and price (with the regular price while on offer), each a link.
function ProductList({ products }) {
  return (
    <ul className="mt-2.5 grid gap-2">
      {products.map((p) => {
        const onOffer = Number.isInteger(p.compareAtPrice) && p.compareAtPrice > p.price;
        return (
          <li key={p.id}>
            <Link
              href={`/products/${p.id}`}
              className="flex items-center gap-3 rounded-xl border border-line/70 bg-surface-page p-2 motion-safe:transition-colors hover:border-gold-bright"
            >
              <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface-cream">
                {p.images?.[0] && <OptimizedImage src={p.images[0]} alt="" fill sizes="48px" className="object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] leading-snug font-bold text-ink">{p.name}</span>
                <span className="block truncate text-[12px] text-ink-muted">{[p.category, p.stock <= 0 ? 'Out of stock' : null].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[14px] font-bold text-brand-text">₹{p.price}</span>
                {onOffer && (
                  <s className="block text-[11.5px] text-ink-muted">
                    <span className="sr-only">regular price </span>₹{p.compareAtPrice}
                  </s>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const chipClass =
  'min-h-9 rounded-pill border border-line bg-surface-card px-3 py-1.5 text-left text-[13px] font-semibold text-ink motion-safe:transition-colors hover:border-gold-bright hover:bg-surface-callout disabled:opacity-50';

function Chips({ title, questions, onPick, disabled }) {
  if (!questions?.length) return null;
  return (
    <div className="mt-3 pl-9">
      <p className="text-label text-gold">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {questions.map((q) => (
          <li key={q}>
            <button type="button" onClick={() => onPick(q)} disabled={disabled} className={chipClass}>
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Message({ message, onRetry }) {
  if (message.from === 'user') {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap text-on-brand">{message.text}</p>
      </li>
    );
  }

  const links = message.links ?? [];
  return (
    <li className="flex gap-2">
      <BotAvatar />
      <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tl-md border border-line/70 bg-surface-card px-3.5 py-2.5 text-[14.5px] leading-relaxed break-words text-ink">
        <FormattedText text={message.text} />
        {message.products?.length > 0 && <ProductList products={message.products} />}
        {links.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {links.map((link) => {
              const className =
                'inline-flex min-h-9 items-center rounded-pill border border-brand-text/30 px-3 text-[13px] font-bold text-brand-text motion-safe:transition-colors hover:bg-surface-tag';
              return link.href.startsWith('mailto:') ? (
                <a key={link.href} href={link.href} className={className}>
                  {link.label}
                </a>
              ) : (
                <Link key={link.href} href={link.href} className={className}>
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
        {message.error && onRetry && (
          <button type="button" onClick={onRetry} className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-brand px-3 text-[13px] font-bold text-on-brand hover:brightness-110">
            <RotateCcw size={14} aria-hidden="true" />
            {ASSISTANT.retry}
          </button>
        )}
        {message.source === 'ai' && (
          <p className="mt-2 flex items-center gap-1 text-[11.5px] text-ink-muted">
            <Sparkles size={12} aria-hidden="true" className="text-gold" />
            {ASSISTANT.aiLabel}
          </p>
        )}
      </div>
    </li>
  );
}

function TypingDots() {
  return (
    <li className="flex gap-2">
      <BotAvatar />
      <span role="status" className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-line/70 bg-surface-card px-4 py-3.5">
        <span className="sr-only">{ASSISTANT.name} is typing</span>
        {[0, 1, 2].map((i) => (
          <span key={i} aria-hidden="true" className="fb-typing-dot size-1.5 rounded-full bg-ink-muted" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
    </li>
  );
}

// The inside of the window. It exists only while the window is open, so the catalogue is only loaded for visitors who
// chat. The conversation itself lives in ChatAssistant, so closing the window keeps it.
function ChatWindow({ titleId, messages, thinking, onSend, onRetry, onClear, onClose }) {
  const { products } = useProducts();
  const [draft, setDraft] = useState('');
  const logRef = useRef(null);
  const inputRef = useRef(null);

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking]);

  // The message box grows with what is typed, up to four lines.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 112)}px`;
  }, [draft]);

  function send(text) {
    if (!text.trim() || thinking) return;
    onSend(text.trim(), products);
    setDraft('');
    inputRef.current?.focus();
  }

  const last = messages[messages.length - 1];
  const started = messages.some((m) => m.from === 'user');
  const showPopular = !thinking && (!started || last?.suggest);
  const related = !thinking && last?.from === 'bot' && !last.suggest ? last.related : null;
  const left = MAX_INPUT - draft.length;

  return (
    <>
      <header className="flex items-center gap-3 bg-gradient-to-br from-hero-mid to-hero-deep px-4 py-3.5 text-on-hero">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-gold-bright/50">
          <AssistantMark size={26} />
          <span aria-hidden="true" className="absolute right-0 bottom-0 size-3 rounded-full bg-[#9fd3b3] ring-2 ring-hero-deep" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-[18px] leading-tight font-bold">
            {ASSISTANT.name}
          </h2>
          <p className="truncate text-[12.5px] text-on-hero/75">{ASSISTANT.status}</p>
        </div>
        {started && (
          <button
            type="button"
            onClick={() => {
              onClear();
              inputRef.current?.focus();
            }}
            aria-label={ASSISTANT.clear}
            title={ASSISTANT.clear}
            className="grid size-10 shrink-0 place-items-center rounded-full text-on-hero/85 hover:bg-white/10 hover:text-on-hero"
          >
            <RotateCcw size={18} aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close chat" className="grid size-10 shrink-0 place-items-center rounded-full text-on-hero/85 hover:bg-white/10 hover:text-on-hero">
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <ol role="log" aria-live="polite" aria-label="Conversation" className="grid gap-3">
          <Message message={{ from: 'bot', text: ASSISTANT.greeting }} />
          {messages.map((m) => (
            <Message key={m.id} message={m} onRetry={m.error && m.id === last?.id ? () => onRetry(products) : null} />
          ))}
          {thinking && <TypingDots />}
        </ol>

        {showPopular && <Chips title={ASSISTANT.suggestionsTitle} questions={SUGGESTIONS} onPick={send} disabled={thinking} />}
        {related?.length > 0 && <Chips title={ASSISTANT.relatedTitle} questions={related} onPick={send} disabled={thinking} />}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
        className="border-t border-line/70 bg-surface-card/70 px-3 pt-3 pb-2"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_INPUT))}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line. Not while an IME (for example Hindi input) is composing.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            aria-label="Your message"
            placeholder={ASSISTANT.placeholder}
            autoComplete="off"
            maxLength={MAX_INPUT}
            autoFocus
            className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-3xl border border-line bg-surface-page px-4 py-2.5 text-body leading-snug text-ink placeholder:text-ink-muted"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || thinking}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-gold-bright text-on-gold motion-safe:transition-[filter,opacity] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowUp size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 flex justify-between gap-2 px-1 text-[11.5px] text-ink-muted">
          <span>{ASSISTANT.note}</span>
          {left <= 60 && <span aria-live="polite">{left} left</span>}
        </p>
      </form>
    </>
  );
}

function loadChat() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(STORE_KEY) ?? 'null');
    return Array.isArray(saved) ? saved.filter((m) => m && (m.from === 'user' || m.from === 'bot') && typeof m.text === 'string') : [];
  } catch {
    return [];
  }
}

function saveChat(messages) {
  try {
    if (messages.length) window.sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-STORE_MAX)));
    else window.sessionStorage.removeItem(STORE_KEY);
  } catch {
    // storage blocked or full: the chat still works, it just won't survive a reload
  }
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { id, from: 'user' | 'bot', text, links?, products?, related?, suggest?, source?, error? }
  const [thinking, setThinking] = useState(false);
  const loaded = useRef(false);
  const nextId = useRef(1);
  const launcherRef = useRef(null);
  const router = useRouter();
  const panelId = useId();
  const titleId = useId();

  // Bring back this tab's conversation after a reload, the first time the window opens (the only time it is seen).
  function openChat() {
    if (!loaded.current) {
      const saved = loadChat();
      if (saved.length) {
        nextId.current = Math.max(...saved.map((m) => m.id || 0)) + 1;
        setMessages(saved);
      }
      loaded.current = true;
    }
    setOpen(true);
  }

  useEffect(() => {
    if (loaded.current) saveChat(messages);
  }, [messages]);

  const add = (message) => setMessages((list) => [...list, { ...message, id: nextId.current++ }]);

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  async function ask(text, products, history) {
    setThinking(true);
    const pause = new Promise((resolve) => setTimeout(resolve, MIN_REPLY_MS));
    try {
      const [reply] = await Promise.all([askAssistant(text, { products, supportEmail: BUSINESS.supportEmail, history }), pause]);
      add({ from: 'bot', ...reply, ask: text });
    } catch {
      add({ from: 'bot', text: 'Sorry, something went wrong on my side.', error: true, ask: text, products: [] });
    } finally {
      setThinking(false);
    }
  }

  function onSend(text, products) {
    const history = historyFor(messages);
    add({ from: 'user', text });
    ask(text, products, history);
  }

  function onRetry(products) {
    const failed = messages[messages.length - 1];
    if (!failed?.error || thinking) return;
    setMessages((list) => list.slice(0, -1));
    ask(failed.ask, products, historyFor(messages.slice(0, -2)));
  }

  function onClear() {
    setMessages([]);
    forgetAnswers();
  }

  // On a phone the window covers most of the page, so going to another page closes it (the conversation stays).
  useEffect(() => {
    const onRoute = () => {
      if (window.matchMedia(PHONE_QUERY).matches) setOpen(false);
    };
    router.events.on('routeChangeStart', onRoute);
    return () => router.events.off('routeChangeStart', onRoute);
  }, [router.events]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close();
            }}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'tween', ease: 'easeOut', duration: 0.2 }}
            className="fb-chat-panel fb-no-print fixed right-3 left-3 z-50 flex origin-bottom-right flex-col overflow-hidden rounded-2xl border border-line/60 bg-surface-page/95 text-ink shadow-2xl backdrop-blur-xl md:left-auto md:right-6 md:w-[400px]"
          >
            <ChatWindow titleId={titleId} messages={messages} thinking={thinking} onSend={onSend} onRetry={onRetry} onClear={onClear} onClose={close} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : openChat())}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? 'Close chat' : `Chat with ${ASSISTANT.name}`}
        className="fb-chat-launcher fb-no-print group fixed right-4 z-40 grid size-14 place-items-center rounded-full bg-gradient-to-br from-hero-mid to-hero-deep text-on-hero shadow-xl ring-1 ring-gold-bright/60 motion-safe:transition-[filter,transform] motion-safe:duration-200 hover:brightness-115 active:scale-95 md:right-6"
      >
        {/* On a computer, a label slides out beside the button on hover or keyboard focus. */}
        {!open && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-full mr-3 hidden translate-x-1 rounded-pill border border-line/70 bg-surface-card px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap text-ink opacity-0 shadow-card motion-safe:transition-all group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 md:block"
          >
            Ask FreshBliss
          </span>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'close' : 'open'}
            initial={{ opacity: 0, rotate: open ? -90 : 90, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: open ? 90 : -90, scale: 0.6 }}
            transition={{ duration: 0.16 }}
            className="grid place-items-center"
          >
            {open ? <ChevronDown size={26} strokeWidth={2.4} aria-hidden="true" /> : <AssistantMark size={30} />}
          </motion.span>
        </AnimatePresence>
      </button>
    </MotionConfig>
  );
}
