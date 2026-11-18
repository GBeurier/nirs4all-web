import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import icon from 'nirs4all-ui/assets/brands/nirs4all/icon.svg?url'
import { SLIDES, type Slide } from './slides'

/**
 * Slide shell: a 1600 × 900 canvas scaled to the window.
 * Keys: → / Space / PageDown next, ← / PageUp previous, Home / End, N notes,
 * P presenter window (synchronised), F full screen. `?print` lays every slide
 * out for PDF export (`?print&notes` adds the speaker notes).
 */

const W = 1600, H = 900
const CHANNEL = 'nirs4all-training-deck'
const params = new URLSearchParams(window.location.search)
const MODE: 'deck' | 'presenter' | 'print' = params.has('print') ? 'print' : params.get('mode') === 'presenter' ? 'presenter' : 'deck'
const TOTAL_MINUTES = SLIDES.reduce((sum, slide) => sum + slide.minutes, 0)

function startIndex(): number {
  const value = Number.parseInt(window.location.hash.slice(1), 10)
  return Number.isFinite(value) && value >= 1 && value <= SLIDES.length ? value - 1 : 0
}

function Frame({ slide, index }: { slide: Slide; index: number }) {
  return (
    <article className="deck-slide n4-app-bg" data-slide={slide.id} aria-label={`Slide ${index + 1}: ${slide.title}`}>
      <header className="deck-head">
        <img src={icon} alt="" width={34} height={34} />
        <span className="deck-brand">nirs4all</span>
        {slide.section ? <span className="deck-section">{slide.section}</span> : null}
      </header>
      {slide.id !== 'title' ? <h2 className="deck-h">{slide.title}</h2> : <div />}
      <div className="deck-body">{slide.body()}</div>
      <footer className="deck-foot">
        <span>Multimodal data and fusion · nirs4all training</span>
        <span>{index + 1} / {SLIDES.length}</span>
      </footer>
    </article>
  )
}

function useScale(ref: React.RefObject<HTMLElement | null>, width = W, height = H) {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setScale(Math.min(element.clientWidth / width, element.clientHeight / height))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, width, height])
  return scale
}

function Scaled({ index }: { index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const scale = useScale(ref)
  return (
    <div className="deck-stage" ref={ref}>
      <div className="deck-canvas" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <Frame slide={SLIDES[index]} index={index} />
      </div>
    </div>
  )
}

function Notes({ slide }: { slide: Slide }) {
  return <div className="deck-notes-text">{slide.notes.map((line, i) => <p key={i}>{line}</p>)}</div>
}

function useNavigation() {
  const [index, setIndex] = useState(startIndex)
  const channel = useMemo(() => typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL), [])
  const go = useCallback((next: number, broadcast = true) => {
    const bounded = Math.max(0, Math.min(SLIDES.length - 1, next))
    setIndex(bounded)
    if (broadcast) channel?.postMessage({ index: bounded })
  }, [channel])
  useEffect(() => {
    if (!channel) return
    channel.onmessage = event => { if (typeof event.data?.index === 'number') go(event.data.index, false) }
    return () => channel.close()
  }, [channel, go])
  useEffect(() => { history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${index + 1}`) }, [index])
  return { index, go }
}

function useKeys(index: number, go: (next: number) => void, extra: (key: string) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); go(index + 1) }
      else if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); go(index - 1) }
      else if (event.key === 'Home') go(0)
      else if (event.key === 'End') go(SLIDES.length - 1)
      else extra(event.key.toLowerCase())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, go, extra])
}

function DeckView() {
  const { index, go } = useNavigation()
  const [notes, setNotes] = useState(false)
  const extra = useCallback((key: string) => {
    if (key === 'n') setNotes(value => !value)
    if (key === 'p') window.open(`${window.location.pathname}?mode=presenter#${index + 1}`, 'nirs4all-presenter', 'width=1200,height=800')
    if (key === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
  }, [index])
  useKeys(index, go, extra)
  return (
    <div className="deck-root" data-notes={notes || undefined}>
      <Scaled index={index} />
      {notes ? <aside className="deck-notes" aria-label="Speaker notes"><strong>{SLIDES[index].minutes} min</strong><Notes slide={SLIDES[index]} /></aside> : null}
      <nav className="deck-nav" aria-label="Slides">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide">‹</button>
        <span>{index + 1} / {SLIDES.length}</span>
        <button type="button" onClick={() => go(index + 1)} disabled={index === SLIDES.length - 1} aria-label="Next slide">›</button>
        <span className="deck-nav-hint">N notes · P presenter · F full screen</span>
      </nav>
    </div>
  )
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function PresenterView() {
  const { index, go } = useNavigation()
  const [started, setStarted] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const extra = useCallback((key: string) => { if (key === 't') setStarted(value => value === null ? Date.now() : null) }, [])
  useKeys(index, go, extra)
  const elapsed = started === null ? 0 : (now - started) / 1000
  const planned = SLIDES.slice(0, index).reduce((sum, slide) => sum + slide.minutes, 0) * 60
  const slide = SLIDES[index]
  return (
    <div className="deck-presenter">
      <div className="deck-presenter-main"><Scaled index={index} /></div>
      <div className="deck-presenter-side">
        <div className="deck-presenter-next">{index + 1 < SLIDES.length ? <Scaled index={index + 1} /> : <p>End of deck</p>}</div>
        <div className="deck-presenter-time">
          <button type="button" onClick={() => setStarted(value => value === null ? Date.now() : null)}>{started === null ? 'Start timer (T)' : 'Reset (T)'}</button>
          <span>elapsed <strong>{clock(elapsed)}</strong></span>
          <span>plan at this slide <strong>{clock(planned)}</strong> / {TOTAL_MINUTES} min</span>
          <span>this slide <strong>{slide.minutes} min</strong></span>
        </div>
      </div>
      <section className="deck-presenter-notes" aria-label="Speaker notes">
        <h2>{index + 1}. {slide.title}</h2>
        <Notes slide={slide} />
      </section>
    </div>
  )
}

function PrintView() {
  const withNotes = params.has('notes')
  return (
    <div className="deck-print" data-notes={withNotes || undefined}>
      {SLIDES.map((slide, index) => (
        <div key={slide.id} className="deck-print-page">
          <div className="deck-print-slide"><Frame slide={slide} index={index} /></div>
          {withNotes ? <div className="deck-print-notes"><h3>{index + 1}. {slide.title} · {slide.minutes} min</h3><Notes slide={slide} /></div> : null}
        </div>
      ))}
    </div>
  )
}

export default function Deck() {
  return MODE === 'print' ? <PrintView /> : MODE === 'presenter' ? <PresenterView /> : <DeckView />
}
