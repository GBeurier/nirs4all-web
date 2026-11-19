import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, BarChart3, Cpu, Database, GitBranch, Layers, Loader2, Lock, ScanSearch, ShieldCheck, Sparkles } from 'lucide-react'
import type { MultimodalRuntimeStatus } from 'nirs4all-ui/multimodal'

const BRAND_SRC = '../brand/icon.svg'

/** Workbench sections, in page order, mirrored by the Web step rail. */
const STEPS = [
  { id: 'n4mm-data', label: 'Dataset', hint: 'Build from your files', icon: Database },
  { id: 'n4mm-explore', label: 'Explore', hint: 'Inspect each source', icon: ScanSearch },
  { id: 'n4mm-case', label: 'Analysis', hint: 'Kind & pipelines', icon: Layers },
  { id: 'n4mm-protocol', label: 'Validation', hint: 'Folds & held-out', icon: ShieldCheck },
  { id: 'n4mm-pipeline', label: 'Pipeline', hint: 'Fusion & run', icon: GitBranch },
  { id: 'n4mm-results', label: 'Results', hint: 'Compare runs', icon: BarChart3 },
] as const

/**
 * The nirs4all Web application frame (top runtime bar, workflow rail, footer)
 * around the shared multimodal workbench, so the laboratory reads as part of Web.
 * `revision` changes whenever sections may appear or disappear.
 */
export function LabShell({ runtime, running, revision, children }: {
  runtime: MultimodalRuntimeStatus
  running: boolean
  revision: string
  children: ReactNode
}) {
  const [present, setPresent] = useState<ReadonlySet<string>>(new Set(['n4mm-case', 'n4mm-data']))
  const [active, setActive] = useState<string>('n4mm-data')

  useEffect(() => {
    const sections = STEPS.map(step => document.getElementById(step.id)).filter((el): el is HTMLElement => el !== null)
    const ids = sections.map(el => el.id)
    setPresent(current => ids.length === current.size && ids.every(id => current.has(id)) ? current : new Set(ids))
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: '-64px 0px -55% 0px' })
    sections.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [revision])

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const activeIndex = STEPS.findIndex(step => step.id === active)

  return (
    <div className="n4lab">
      <div className="n4lab-strip" />
      <header className="n4lab-bar">
        <div className="n4lab-brand">
          <img src={BRAND_SRC} alt="nirs4all" draggable={false} className="n4lab-logo" />
          <div className="n4lab-wordmark">
            <span className="n4lab-name">nirs4all</span>
            <span className="n4lab-badge">web</span>
          </div>
        </div>
        <h1 className="n4lab-title">Multisource and multimodal fusion</h1>
        <div className="n4lab-actions">
          {running ? (
            <span className="n4lab-pill" data-tone="teal">
              <Loader2 className="n4lab-spin" /> running…
            </span>
          ) : (
            <span title={runtime.detail} className="n4lab-pill" data-hide="sm" data-tone={runtime.state === 'unavailable' ? 'amber' : undefined}>
              <Cpu className="n4lab-icon-sm" /> {runtime.label}
            </span>
          )}
          <span className="n4lab-pill" data-hide="lg">
            Local only · data never leaves this browser
          </span>
          <a href="../" className="n4lab-pill" data-tone="teal" data-link>
            <ArrowLeft className="n4lab-icon-sm" /> <span className="n4lab-hide-sm">nirs4all Web workbench</span>
          </a>
          <a href="https://nirs4all.org" target="_blank" rel="noreferrer" className="n4lab-pill" data-hide="sm" data-link>
            <Sparkles className="n4lab-teal" /> nirs4all.org
          </a>
        </div>
      </header>

      <div className="n4lab-body">
        <nav aria-label="Laboratory sections" className="n4lab-rail">
          <div className="n4lab-steps">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              const enabled = present.has(step.id)
              const isActive = step.id === active
              const isDone = enabled && !isActive && activeIndex > i
              return (
                <button key={step.id} type="button" data-lab-step={step.id} disabled={!enabled} onClick={() => go(step.id)}
                  className="n4lab-step" data-state={isActive ? 'active' : isDone ? 'done' : undefined}>
                  <span className="n4lab-step-icon">
                    {enabled ? <Icon className="n4lab-icon" /> : <Lock className="n4lab-icon-sm" />}
                  </span>
                  <span className="n4lab-step-text">
                    <span className="n4lab-step-line">
                      <span className="n4lab-step-num">{i + 1}</span>
                      <span className="n4lab-step-label">{step.label}</span>
                    </span>
                    <span className="n4lab-step-hint">{step.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="n4lab-stack-wrap">
            <div className="n4lab-stack">
              <div className="n4lab-stack-title">
                <Cpu className="n4lab-teal" /> Local WASM stack
              </div>
              <p className="n4lab-stack-mono">io → dag-ml-data → dag-ml + methods</p>
              <p className="n4lab-stack-note">Browser models: ml.js, TensorFlow.js, Burn.</p>
            </div>
          </div>
        </nav>
        <main className="n4lab-step-text">{children}</main>
      </div>

      <footer className="n4lab-footer">
        <div className="n4lab-footer-inner">
          <div className="n4lab-brand">
            <img src={BRAND_SRC} alt="" draggable={false} className="n4lab-logo-sm" />
            <span className="n4lab-footer-text">
              <span className="n4lab-footer-name">nirs4all</span> · multimodal laboratory · 100% client-side WASM
            </span>
          </div>
          <nav className="n4lab-footer-links">
            <a href="../multimodal-training/slides/">Training slides</a>
            <a href="https://nirs4all.org" target="_blank" rel="noreferrer">nirs4all.org</a>
            <a href="../legal/">Licences</a>
            <a href="https://github.com/GBeurier/nirs4all-web" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
