import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Minus,
  UserPlus,
  FileSearch,
  HeartHandshake,
  Lock,
} from 'lucide-react';
import { DemoMascot } from './DemoMascot';
import styles from './GuidedDemoTour.module.css';

export interface DemoTourStep {
  id: string;
  // Dashboard tab to activate for this step. null = welcome/closing (no module).
  tab: string | null;
  // data-tour-id of the on-screen element to spotlight. null = no spotlight.
  targetId: string | null;
  title: string;
  // One or two short sentences — Auri presents, she does not document.
  body: string;
  // Optional one-line note about what's blocked in the demo.
  demoNote?: string;
  // Where to float the "Veja aqui" cue relative to the target. Default: auto.
  placement?: 'top' | 'bottom';
  mood?: 'happy' | 'wave' | 'cheer' | 'neutral';
}

// Auri Walkthrough Mode (Sprint 5.0F.2; fluid placement 5.0F.3): micro-steps that
// each point at one piece of the screen. Short copy, strong visual focus. The
// mechanic is demonstrated across every main module; targets degrade gracefully
// when an element is absent.
export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'welcome',
    tab: null,
    targetId: null,
    mood: 'wave',
    title: 'Oi! Eu sou a Auri 👋',
    body: 'Vou te guiar por uma clínica de exemplo, destacando uma parte da tela de cada vez.',
    demoNote: 'Tudo é fictício. Ações que salvam dados ficam bloqueadas aqui.',
  },
  {
    id: 'nav',
    tab: 'agenda',
    targetId: 'nav-agenda',
    mood: 'happy',
    title: 'Este é o menu',
    body: 'Por aqui você troca de módulo. Vamos começar pela Agenda.',
    placement: 'bottom',
  },
  {
    id: 'agenda-summary',
    tab: 'agenda',
    targetId: 'agenda-summary',
    mood: 'happy',
    title: 'O dia num olhar',
    body: 'Agendados, confirmados e faltas do dia, sempre à vista.',
  },
  {
    id: 'agenda-filters',
    tab: 'agenda',
    targetId: 'agenda-filters',
    mood: 'happy',
    title: 'Encontre rápido',
    body: 'Filtre por data, profissional ou situação.',
  },
  {
    id: 'agenda-actions',
    tab: 'agenda',
    targetId: 'agenda-list',
    mood: 'happy',
    title: 'Cada horário',
    body: 'Em cada agendamento dá para confirmar, concluir ou remarcar.',
    demoNote: 'Essas ações ficam bloqueadas na demonstração.',
  },
  {
    id: 'patients-search',
    tab: 'pacientes',
    targetId: 'patients-search',
    mood: 'happy',
    title: 'Ache qualquer paciente',
    body: 'Busque por nome, e-mail ou telefone.',
  },
  {
    id: 'patients-list',
    tab: 'pacientes',
    targetId: 'patients-list',
    mood: 'happy',
    title: 'Cartão do paciente',
    body: 'Cada cartão abre o histórico e o prontuário de quem tem permissão.',
    demoNote: 'A exportação da lista fica bloqueada na demonstração.',
  },
  {
    id: 'financial-summary',
    tab: 'financeiro',
    targetId: 'financial-summary',
    mood: 'happy',
    title: 'Dinheiro no controle',
    body: 'Em aberto, vencidas e recebido no período.',
  },
  {
    id: 'financial-table',
    tab: 'financeiro',
    targetId: 'financial-table',
    mood: 'happy',
    title: 'Todas as cobranças',
    body: 'A clínica inteira em uma tabela só.',
  },
  {
    id: 'financial-payer',
    tab: 'financeiro',
    targetId: 'financial-payer',
    mood: 'happy',
    title: 'Quem paga?',
    body: 'O badge mostra se é particular, convênio ou misto.',
  },
  {
    id: 'financial-details',
    tab: 'financeiro',
    targetId: 'financial-details',
    mood: 'happy',
    title: 'Veja por dentro',
    body: 'Detalhes abre a cobrança completa.',
    demoNote: 'Criar cobrança e registrar recebimento ficam bloqueados.',
    placement: 'top',
  },
  {
    id: 'insurance-tabs',
    tab: 'convenios',
    targetId: 'insurance-tabs',
    mood: 'happy',
    title: 'Convênios em 3 partes',
    body: 'Carteirinhas, convênios aceitos e preços de referência.',
    placement: 'bottom',
  },
  {
    id: 'insurance-cards',
    tab: 'convenios',
    targetId: 'insurance-content',
    mood: 'happy',
    title: 'Carteirinhas',
    body: 'Ligam cada paciente ao seu convênio — o preço nunca preenche a cobrança sozinho.',
  },
  {
    id: 'inventory-summary',
    tab: 'estoque',
    targetId: 'inventory-summary',
    mood: 'happy',
    title: 'Estoque em dia',
    body: 'Itens ativos e quanto está com estoque baixo.',
  },
  {
    id: 'inventory-filters',
    tab: 'estoque',
    targetId: 'inventory-filters',
    mood: 'happy',
    title: 'Foco no que falta',
    body: 'Filtre por categoria ou veja só o que está acabando.',
  },
  {
    id: 'inventory-list',
    tab: 'estoque',
    targetId: 'inventory-list',
    mood: 'happy',
    title: 'Item por item',
    body: 'Cada item guarda o histórico de entradas e saídas.',
    demoNote: 'Registrar movimentos fica bloqueado na demonstração.',
  },
  {
    id: 'reports-filters',
    tab: 'relatorios',
    targetId: 'reports-filters',
    mood: 'happy',
    title: 'Escolha o período',
    body: 'Hoje, 7 dias, o mês ou um intervalo personalizado.',
    placement: 'bottom',
  },
  {
    id: 'reports-summary',
    tab: 'relatorios',
    targetId: 'reports-summary',
    mood: 'happy',
    title: 'Resultados num relance',
    body: 'O resumo do período aparece aqui no topo.',
  },
  {
    id: 'services-list',
    tab: 'servicos',
    targetId: 'services-list',
    mood: 'happy',
    title: 'Serviços e preços',
    body: 'Cada serviço tem preço, duração e os profissionais que o realizam.',
  },
  {
    id: 'closing',
    tab: null,
    targetId: null,
    mood: 'cheer',
    title: 'Curtiu? 🎉',
    body: 'No dia a dia é simples assim. Leve o ClinicBridge para a sua clínica:',
  },
];

type Side = 'right' | 'left' | 'below' | 'above';
interface Placement {
  top: number;
  left: number;
  side: Side;
}
interface Size {
  width: number;
  height: number;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), Math.max(min, max));

// ── Hook: locate the target element and track its viewport rect ───────────────
// Moved out of the old TourSpotlight (5.0F.2) so the ring AND the panel share one
// measurement. Keeps the previous rect while searching for the next target, so
// both the ring and Auri's panel glide smoothly between steps instead of blinking.
function useTargetRect(targetId: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return;
    }

    let raf = 0;
    let tries = 0;
    let el: HTMLElement | null = null;
    const timers: number[] = [];

    const measure = (): void => {
      if (el) setRect(el.getBoundingClientRect());
    };

    const locate = (): void => {
      el = document.querySelector<HTMLElement>(`[data-tour-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        measure();
        // Re-measure after the smooth scroll settles.
        timers.push(window.setTimeout(measure, 360));
      } else if (tries < 30) {
        tries += 1;
        raf = requestAnimationFrame(locate);
      } else {
        setRect(null);
      }
    };

    // Intentionally NOT resetting to null here: keep showing the previous rect
    // until the new element is found, so the ring/panel transition is continuous.
    raf = requestAnimationFrame(locate);

    const onReflow = (): void => measure();
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [targetId]);

  return rect;
}

// ── Hook: is the viewport in mobile bottom-sheet territory (≤768px)? ──────────
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (): void => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

// ── Hook: honour prefers-reduced-motion (also gates the mascot's SMIL anims) ──
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// Mood → one-shot reaction class replayed on each step (keyed remount). Calm/still
// under reduced motion.
function reactionClass(mood: DemoTourStep['mood'], reduced: boolean): string {
  if (reduced) return styles.mascotStill;
  switch (mood) {
    case 'wave':
      return styles.react_wave;
    case 'cheer':
      return styles.react_cheer;
    case 'neutral':
      return styles.react_neutral;
    default:
      return styles.react_happy;
  }
}

// ── Hook: measure the panel so placement can avoid clipping/overlap ───────────
function usePanelSize(ref: RefObject<HTMLElement>, dep: unknown): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => setSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // dep (the step index) re-runs the measure when the card's content swaps.
  }, [ref, dep]);
  return size;
}

// Try right → left → below → above; null = nothing fits (caller docks). Each side
// clears the target on its main axis, so the panel never covers the highlight.
// topSafe/leftSafe leave room for Auri's avatar poking out of the top-left edge
// (5.0F.4) so she isn't clipped by the viewport.
function computePlacement(t: DOMRect, p: Size): Placement | null {
  const gap = 16;
  const m = 12;
  // Reserve room above the card so Auri (her own floating layer, 5.0F.5) and her
  // poke-out aren't clipped by the top of the viewport.
  const topSafe = 124;
  const leftSafe = 20;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampY = (y: number): number => clamp(y, topSafe, vh - p.height - m);
  const clampX = (x: number): number => clamp(x, leftSafe, vw - p.width - m);

  if (t.right + gap + p.width <= vw - m) {
    return { side: 'right', left: t.right + gap, top: clampY(t.top) };
  }
  if (t.left - gap - p.width >= leftSafe) {
    return { side: 'left', left: t.left - gap - p.width, top: clampY(t.top) };
  }
  if (t.bottom + gap + p.height <= vh - m) {
    return { side: 'below', top: t.bottom + gap, left: clampX(t.left) };
  }
  if (t.top - gap - p.height >= topSafe) {
    return { side: 'above', top: t.top - gap - p.height, left: clampX(t.left) };
  }
  return null;
}

// ── Spotlight ring (visual only) ──────────────────────────────────────────────
function SpotlightRing({ rect }: { rect: DOMRect }): JSX.Element {
  const pad = 8;
  return (
    <div
      className={styles.spotlight}
      style={{
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }}
      aria-hidden="true"
    />
  );
}

// ── "Veja aqui" cue, used only when the panel is docked far from the target ───
function SpotCue({
  rect,
  placement,
}: {
  rect: DOMRect;
  placement?: 'top' | 'bottom';
}): JSX.Element {
  const pad = 8;
  const top = rect.top - pad;
  const height = rect.height + pad * 2;
  const below = placement === 'bottom' || top < 52;
  return (
    <div
      className={styles.spotCue}
      style={{ top: below ? top + height + 8 : top - 30, left: Math.max(rect.left - pad, 8) }}
      aria-hidden="true"
    >
      Veja aqui
    </div>
  );
}

interface Props {
  step: number;
  setStep: (n: number) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onExitTo: (path: string) => void;
}

export function GuidedDemoTour({
  step,
  setStep,
  collapsed,
  setCollapsed,
  onExitTo,
}: Props): JSX.Element {
  const total = DEMO_TOUR_STEPS.length;
  const safeStep = Math.min(Math.max(step, 0), total - 1);
  const current = DEMO_TOUR_STEPS[safeStep];
  const isFirst = safeStep === 0;
  const isLast = safeStep === total - 1;

  const panelRef = useRef<HTMLDivElement>(null);
  const targetRect = useTargetRect(collapsed ? null : current.targetId);
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const panelSize = usePanelSize(panelRef, safeStep);

  // Desktop: float Auri next to the highlight. Mobile / no-target / no-fit: dock.
  const placement =
    !isMobile && targetRect && targetRect.width > 0 && panelSize
      ? computePlacement(targetRect, panelSize)
      : null;

  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.bubble}
        onClick={() => setCollapsed(false)}
        aria-label="Abrir o guia da demonstração"
      >
        <span className={styles.bubbleFloat}>
          <DemoMascot className={styles.bubbleMascot} mood="happy" />
        </span>
        <span className={styles.bubblePing} aria-hidden="true" />
      </button>
    );
  }

  const showRing = !!targetRect && targetRect.width > 0;
  // Cue only when the panel is far (docked / mobile) — avoids duplicating the
  // "look here" affordance when the arrow connector already does the job.
  const showCue = showRing && !placement;

  const panelStyle: CSSProperties | undefined = placement
    ? { top: placement.top, left: placement.left, right: 'auto', bottom: 'auto' }
    : undefined;

  // ── Auri's own floating layer (5.0F.5) ──────────────────────────────────────
  // The card is now her speech bubble; Auri is a separate character floating just
  // above it, biased toward the target so she reads as pointing at the highlight.
  const AURI_SIZE = isMobile ? 80 : 104;

  // Where the card actually sits (from placement, or the docked / bottom-sheet
  // geometry) — derived from values we already have, no extra DOM measuring.
  let cardBox: { top: number; left: number; width: number; height: number } | null = null;
  if (panelSize) {
    if (placement) {
      cardBox = { top: placement.top, left: placement.left, width: panelSize.width, height: panelSize.height };
    } else if (isMobile) {
      cardBox = {
        top: window.innerHeight - 12 - panelSize.height,
        left: 12,
        width: panelSize.width,
        height: panelSize.height,
      };
    } else {
      const dock = 24;
      cardBox = {
        top: window.innerHeight - dock - panelSize.height,
        left: window.innerWidth - dock - panelSize.width,
        width: panelSize.width,
        height: panelSize.height,
      };
    }
  }

  let auriLeft = 0;
  let auriTop = 0;
  let tailLeft = 0;
  let auriTiltClass = '';
  if (cardBox) {
    if (isMobile) {
      // Mobile (5.0F.6): bigger Auri, centred over the card and overlapping its
      // top edge (the card has a top "shelf" for her) so she owns the balloon
      // instead of getting lost between the card and the spotlight.
      const overlap = 26;
      const cx = cardBox.left + cardBox.width / 2;
      auriLeft = clamp(cx - AURI_SIZE / 2, 8, window.innerWidth - AURI_SIZE - 8);
      auriTop = clamp(cardBox.top - AURI_SIZE + overlap, 8, window.innerHeight - AURI_SIZE - 8);
      if (targetRect && targetRect.width > 0) {
        const tcx = targetRect.left + targetRect.width / 2;
        const acx = auriLeft + AURI_SIZE / 2;
        auriTiltClass = tcx < acx - 16 ? styles.tiltLeft : tcx > acx + 16 ? styles.tiltRight : '';
      }
    } else {
      const pokeGap = 10;
      const cxRaw =
        targetRect && targetRect.width > 0
          ? targetRect.left + targetRect.width / 2
          : cardBox.left + Math.min(40, cardBox.width / 2);
      const cx = clamp(cxRaw, cardBox.left + 24, cardBox.left + cardBox.width - 24);
      let top = cardBox.top - AURI_SIZE - pokeGap;
      // Never sit on top of a target that's directly above the card.
      if (targetRect && placement?.side === 'below') top = Math.max(top, targetRect.bottom + 6);
      auriLeft = clamp(cx - AURI_SIZE / 2, 8, window.innerWidth - AURI_SIZE - 8);
      auriTop = clamp(top, 8, window.innerHeight - AURI_SIZE - 8);
      tailLeft = clamp(cx - cardBox.left, 18, cardBox.width - 18);
      if (targetRect && targetRect.width > 0) {
        const tcx = targetRect.left + targetRect.width / 2;
        const acx = auriLeft + AURI_SIZE / 2;
        auriTiltClass = tcx < acx - 12 ? styles.tiltLeft : tcx > acx + 12 ? styles.tiltRight : '';
      }
    }
  }

  return (
    <>
      {showRing && targetRect && <SpotlightRing rect={targetRect} />}
      {showCue && targetRect && <SpotCue rect={targetRect} placement={current.placement} />}

      <motion.aside
        ref={panelRef}
        className={`${styles.panel} ${placement ? styles.panelFloating : ''}`}
        style={panelStyle}
        role="region"
        aria-label="Guia da demonstração"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {cardBox && !isMobile && (
          <span className={styles.cardTail} style={{ left: tailLeft }} aria-hidden="true" />
        )}

        <div className={styles.inner}>
          <header className={styles.header}>
            <span className={styles.headText}>
              <span className={styles.name}>Auri</span>
              <span className={styles.role}>guia da demonstração</span>
            </span>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setCollapsed(true)}
              aria-label="Minimizar o guia"
              title="Minimizar"
            >
              <Minus size={18} aria-hidden="true" />
            </button>
          </header>

          <div className={styles.progressRow}>
            <div
              className={styles.progress}
              role="group"
              aria-label={`Passo ${safeStep + 1} de ${total}`}
            >
              {DEMO_TOUR_STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.segment} ${i <= safeStep ? styles.segmentOn : ''}`}
                  onClick={() => setStep(i)}
                  aria-label={`Ir para o passo ${i + 1}: ${s.title}`}
                  aria-current={i === safeStep ? 'step' : undefined}
                />
              ))}
            </div>
            <span className={styles.counter}>{safeStep + 1}/{total}</span>
          </div>

          <h3 className={styles.title}>{current.title}</h3>
          <p className={styles.body}>{current.body}</p>

          {current.demoNote && (
            <p className={styles.demoNote}>
              <Lock size={13} className={styles.demoNoteIcon} aria-hidden="true" />
              <span>{current.demoNote}</span>
            </p>
          )}

          {isLast && (
            <div className={styles.ctaCol}>
              <button type="button" className={styles.ctaPrimary} onClick={() => onExitTo('/register')}>
                <UserPlus size={15} aria-hidden="true" />
                Criar conta
              </button>
              <button type="button" className={styles.ctaGhost} onClick={() => onExitTo('/register')}>
                <FileSearch size={15} aria-hidden="true" />
                Preparar arquivo de teste
              </button>
              <button type="button" className={styles.ctaGhost} onClick={() => onExitTo('/#planos')}>
                <HeartHandshake size={15} aria-hidden="true" />
                Conhecer o piloto assistido
              </button>
            </div>
          )}

          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setStep(safeStep - 1)}
              disabled={isFirst}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Voltar
            </button>

            {!isLast ? (
              <button type="button" className={styles.navBtnPrimary} onClick={() => setStep(safeStep + 1)}>
                Próximo
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => setStep(0)}
                aria-label="Recomeçar o tour"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Recomeçar
              </button>
            )}
          </footer>

          {!isLast && (
            <div className={styles.subActions}>
              <button type="button" className={styles.linkBtn} onClick={() => setStep(total - 1)}>
                Pular
              </button>
              <button type="button" className={styles.linkBtn} onClick={() => setStep(0)}>
                Recomeçar
              </button>
            </div>
          )}
        </div>
      </motion.aside>

      {cardBox && (
        <div
          className={styles.auriLayer}
          style={{ top: auriTop, left: auriLeft, width: AURI_SIZE, height: AURI_SIZE }}
          aria-hidden="true"
        >
          <div className={reduced ? styles.auriFloatStill : styles.auriFloat}>
            {/* key={safeStep} replays the per-mood reaction on each step. */}
            <span key={safeStep} className={reactionClass(current.mood, reduced)}>
              <span className={`${styles.auriTilt} ${auriTiltClass}`}>
                <DemoMascot
                  className={styles.auriMascot}
                  mood={current.mood ?? 'happy'}
                  animated={!reduced}
                />
              </span>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
