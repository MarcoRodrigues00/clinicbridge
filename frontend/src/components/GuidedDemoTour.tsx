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
// ── Future: per-module contextual tours (Sprint 6.0C.1 backlog) ──────────────
// Each module will eventually offer its own focused tour triggered by a "?"
// button within the panel or when a user first opens the tab. The IDs below
// reserve the namespace; no steps are defined yet. Wiring happens in a future
// sprint once the backlog is prioritised. See docs/sprint-history.md for the
// full planned list.
export const TOUR_IDS = {
  ONBOARDING: 'onboarding',   // current: full app walkthrough
  AGENDA: 'agenda',           // future: filtros, anti-overlap, cobrança
  PATIENTS: 'patients',       // future: busca, prontuário, documentos
  FINANCIAL: 'financial',     // future: cobrança, marcar pago, convênio
  DOCUMENTS: 'documents',     // future: criar/finalizar PDF, orientação
  INSURANCE: 'insurance',     // future: carteirinha, operadora, preço ref.
  INVENTORY: 'inventory',     // future: item, movimento, estoque baixo
  REPORTS: 'reports',         // future: período e interpretação dos cards
  PLAN: 'plan',               // future: assinatura, limites, pagamento
  TEAM: 'team',               // Sprint 6.1C.1: governança da clínica (aba Equipe)
} as const;

export type TourId = (typeof TOUR_IDS)[keyof typeof TOUR_IDS];

// ── Module tour steps (Sprint 6.0F) ──────────────────────────────────────────
// Each module gets a short contextual tour (5-6 steps) using existing
// data-tour-id targets. Steps have tab:null — the user is already on the
// correct tab when they click "Auri explica". Content is administrative only:
// no clinical data, no PII, no diagnosis, no medication.

export const AGENDA_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'ag-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Agenda administrativa',
    body: 'Esta área registra os horários da clínica. Apenas dados administrativos — sem prontuário ou dado clínico.',
  },
  {
    id: 'ag-summary', tab: null, targetId: 'agenda-summary', mood: 'happy',
    title: 'Resumo do dia',
    body: 'Total de agendamentos, confirmados e faltas/cancelados sempre à vista.',
  },
  {
    id: 'ag-filters', tab: null, targetId: 'agenda-filters', mood: 'happy',
    title: 'Filtros',
    body: 'Filtre por profissional, serviço ou status. "Limpar filtros" restaura a visão completa.',
  },
  {
    id: 'ag-list', tab: null, targetId: 'agenda-list', mood: 'happy',
    title: 'Cards de agendamento',
    body: 'Cada card mostra paciente, profissional e serviço. Confirme, conclua, remarque ou cancele direto aqui.',
  },
  {
    id: 'ag-create', tab: null, targetId: 'agenda-create', mood: 'happy',
    title: 'Novo agendamento',
    body: 'Crie um horário escolhendo paciente, profissional e serviço. O sistema bloqueia sobreposição no mesmo profissional.',
  },
];

export const PATIENTS_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'pa-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Pacientes',
    body: 'Dados administrativos dos pacientes. Sem prontuário ou informação clínica nesta área.',
  },
  {
    id: 'pa-search', tab: null, targetId: 'patients-search', mood: 'happy',
    title: 'Busca rápida',
    body: 'Busque por nome, e-mail ou telefone. A lista é paginada para manter a tela leve.',
  },
  {
    id: 'pa-list', tab: null, targetId: 'patients-list', mood: 'happy',
    title: 'Cartões de paciente',
    body: 'Cada cartão mostra o status do paciente. Clique em "Ver detalhes" para histórico administrativo.',
  },
  {
    id: 'pa-clinical', tab: null, targetId: null, mood: 'neutral',
    title: 'Prontuário e documentos',
    body: 'O prontuário e os documentos médicos ficam em área clínica protegida, acessível apenas a quem tem permissão clínica específica.',
  },
];

export const FINANCIAL_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'fi-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Financeiro da clínica',
    body: 'Cobranças da clínica com seus pacientes. Diferente da assinatura do ClinicBridge (que fica em Plano e assinatura).',
  },
  {
    id: 'fi-summary', tab: null, targetId: 'financial-summary', mood: 'happy',
    title: 'Totalizadores',
    body: 'Valores em aberto, vencidos e recebidos no período. Atualizado a cada visita.',
  },
  {
    id: 'fi-table', tab: null, targetId: 'financial-table', mood: 'happy',
    title: 'Lista de cobranças',
    body: 'Todas as cobranças em uma tabela. Clique em "Detalhes" para ver, editar ou marcar como pago.',
  },
  {
    id: 'fi-payer', tab: null, targetId: 'financial-payer', mood: 'happy',
    title: 'Tipo de pagador',
    body: 'A etiqueta colorida indica se a cobrança é particular, convênio ou mista.',
  },
  {
    id: 'fi-create', tab: null, targetId: null, mood: 'happy',
    title: 'Criar e registrar',
    body: 'Use "Nova cobrança" para registrar, ou crie direto de um agendamento na Agenda. Marque como pago ao receber.',
  },
];

export const DOCUMENTS_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'doc-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Documentos clínicos',
    body: 'Esta área registra documentos médicos do paciente. Apenas profissionais com permissão clínica têm acesso.',
  },
  {
    id: 'doc-list', tab: null, targetId: 'docs-list', mood: 'happy',
    title: 'Lista de documentos',
    body: 'Cada documento mostra tipo, data e status — rascunho, finalizado ou cancelado.',
  },
  {
    id: 'doc-create', tab: null, targetId: 'docs-create', mood: 'happy',
    title: 'Novo documento',
    body: 'Preencha título, tipo e conteúdo. Salve como rascunho e finalize quando estiver pronto.',
  },
  {
    id: 'doc-status', tab: null, targetId: null, mood: 'neutral',
    title: 'Ciclo do documento',
    body: 'Rascunho → Finalizado → (opcional) Cancelado. Finalizado gera PDF sob demanda. Documentos cancelados não são excluídos.',
  },
  {
    id: 'doc-sign', tab: null, targetId: null, mood: 'neutral',
    title: 'Assinatura digital',
    body: 'Assinatura com validade legal (ICP-Brasil/Gov.br) deve ser feita fora do ClinicBridge nesta fase. O sistema mostra orientações, mas não substitui esse processo.',
  },
];

export const INSURANCE_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'ins-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Convênios',
    body: 'Camada administrativa e comercial da clínica. Não é integração TISS/TUSS/ANS — apenas cadastro de referência para cobranças.',
  },
  {
    id: 'ins-tabs', tab: null, targetId: 'insurance-tabs', mood: 'happy',
    title: 'Três seções',
    body: 'Carteirinhas dos pacientes, Convênios aceitos e Preços de referência. Use as abas para navegar.',
    placement: 'bottom',
  },
  {
    id: 'ins-content', tab: null, targetId: 'insurance-content', mood: 'happy',
    title: 'Conteúdo da aba',
    body: 'Aqui aparecem os registros da seção ativa: carteirinhas, operadoras/planos ou tabela de preços.',
  },
  {
    id: 'ins-pii', tab: null, targetId: null, mood: 'neutral',
    title: 'Carteirinha é dado pessoal',
    body: 'O número da carteirinha é um dado pessoal. Ele não é exibido na listagem — acesse o registro do paciente para vê-lo.',
  },
  {
    id: 'ins-prices', tab: null, targetId: null, mood: 'neutral',
    title: 'Preços de referência',
    body: 'Os preços cadastrados aqui são só referência. Eles não preenchem automaticamente o valor da cobrança — você confirma o valor ao criar cada cobrança.',
  },
];

export const INVENTORY_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'inv-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Estoque',
    body: 'Controle de materiais e insumos da clínica. Apenas materiais de uso administrativo/operacional — sem medicamentos controlados ou integração SNGPC/ANVISA.',
  },
  {
    id: 'inv-summary', tab: null, targetId: 'inventory-summary', mood: 'happy',
    title: 'Resumo do estoque',
    body: 'Total de itens ativos e quantos estão com estoque baixo. O alerta de baixo é por item, com limite configurável.',
  },
  {
    id: 'inv-filters', tab: null, targetId: 'inventory-filters', mood: 'happy',
    title: 'Filtros',
    body: 'Filtre por categoria, status ou ative "Só estoque baixo" para focar no que precisa de reposição.',
  },
  {
    id: 'inv-list', tab: null, targetId: 'inventory-list', mood: 'happy',
    title: 'Item por item',
    body: 'Cada item guarda o histórico completo de entradas e saídas. Clique para expandir e registrar movimentos.',
  },
  {
    id: 'inv-movement', tab: null, targetId: null, mood: 'neutral',
    title: 'Movimentos são manuais',
    body: 'Entradas, saídas e ajustes são registrados manualmente. O sistema não subtrai estoque automaticamente por atendimento.',
  },
];

export const REPORTS_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'rep-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Relatórios',
    body: 'Visão gerencial de agenda, financeiro e pacientes. Apenas dados administrativos — nenhum dado clínico sensível.',
  },
  {
    id: 'rep-filters', tab: null, targetId: 'reports-filters', mood: 'happy',
    title: 'Escolha o período',
    body: 'Hoje, 7 dias, 30 dias, mês atual ou intervalo personalizado. O resumo e os blocos abaixo se atualizam automaticamente.',
    placement: 'bottom',
  },
  {
    id: 'rep-summary', tab: null, targetId: 'reports-summary', mood: 'happy',
    title: 'Resumo do período',
    body: 'Consultas, receita recebida, receita em aberto e pacientes no período — números consolidados.',
  },
  {
    id: 'rep-sections', tab: null, targetId: null, mood: 'happy',
    title: 'Quatro blocos',
    body: 'Abaixo do resumo: Agenda (agendamentos e status), Financeiro (cobranças), Pacientes (cadastros) e cruzamento Agenda×Financeiro.',
  },
  {
    id: 'rep-note', tab: null, targetId: null, mood: 'neutral',
    title: 'Leitura gerencial',
    body: 'Os relatórios mostram totais e tendências — sem diagnósticos, evolução clínica ou dados de prontuário.',
  },
];

export const PLAN_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'plan-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Plano e assinatura',
    body: 'Esta área é sobre a assinatura do ClinicBridge — diferente do Financeiro, que registra cobranças da clínica com seus pacientes.',
  },
  {
    id: 'plan-card', tab: null, targetId: 'subscription-plan', mood: 'happy',
    title: 'Plano atual',
    body: 'Veja o plano ativo, o status da conta e se há algum alerta de vencimento ou suspensão.',
  },
  {
    id: 'plan-modules', tab: null, targetId: 'subscription-modules', mood: 'happy',
    title: 'Módulos incluídos',
    body: 'Lista dos recursos habilitados no plano. Módulos clínicos exigem também permissão clínica configurada pela clínica.',
  },
  {
    id: 'plan-limits', tab: null, targetId: 'subscription-limits', mood: 'happy',
    title: 'Limites do plano',
    body: 'Pacientes, importações e outros limites. O sistema avisará antes de atingir o teto — acesso suave, sem corte brusco de dados.',
  },
  {
    id: 'plan-payment', tab: null, targetId: null, mood: 'neutral',
    title: 'Pagamento online',
    body: 'A cobrança da assinatura por Pix ou cartão está em preparação. Por ora o plano é gerenciado manualmente — todos os módulos abaixo estão acessíveis.',
  },
];

// Clinic Governance tour (Sprint 6.1C.1): explains the governance axis added in
// 6.1C. Short on purpose. Promises NOTHING that does not exist yet — no revoke,
// no titularity transfer, no clinical access, no real billing.
export const TEAM_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'tm-welcome', tab: null, targetId: null, mood: 'wave',
    title: 'Governança da clínica',
    body: 'Governança define quem administra a clínica. O Titular responde pela conta.',
  },
  {
    id: 'tm-roles', tab: null, targetId: 'governance-panel', mood: 'happy',
    title: 'Titular e Administradores',
    body: 'Administradores ajudam na gestão — como serviços e configurações permitidas. O Titular segue como responsável principal.',
  },
  {
    id: 'tm-clinical', tab: null, targetId: null, mood: 'neutral',
    title: 'Acesso clínico é separado',
    body: 'Ser Administrador não libera o prontuário automaticamente. O acesso clínico continua separado, em Acesso ao prontuário.',
  },
];

// Map used by Dashboard to resolve the active module tour steps.
// ClinicalDocumentsPanel manages its own tour state (nested context, not top-level tab).
export const MODULE_TOUR_STEPS: Partial<Record<TourId, DemoTourStep[]>> = {
  [TOUR_IDS.AGENDA]: AGENDA_TOUR_STEPS,
  [TOUR_IDS.PATIENTS]: PATIENTS_TOUR_STEPS,
  [TOUR_IDS.FINANCIAL]: FINANCIAL_TOUR_STEPS,
  [TOUR_IDS.INSURANCE]: INSURANCE_TOUR_STEPS,
  [TOUR_IDS.INVENTORY]: INVENTORY_TOUR_STEPS,
  [TOUR_IDS.REPORTS]: REPORTS_TOUR_STEPS,
  [TOUR_IDS.PLAN]: PLAN_TOUR_STEPS,
  [TOUR_IDS.TEAM]: TEAM_TOUR_STEPS,
};

// ── App onboarding steps (Sprint 6.0C) ───────────────────────────────────────
// Used in the internal tour for logged-in users on their own clinic — NOT the
// Demo Aurora public tour. No demoNote, no exit-to-register CTAs, no write-block.
// Steps are role-agnostic: targets that don't exist (e.g. nav-equipe for non-
// owners) degrade gracefully — useTargetRect returns null and no spotlight shows.
// Content is administrative only: no clinical examples, no PII, no promises
// about specific role access.
export const ONBOARDING_STEPS: DemoTourStep[] = [
  {
    id: 'ob-welcome',
    tab: null,
    targetId: null,
    mood: 'wave',
    title: 'Oi! Eu sou a Auri 👋',
    body: 'Vou te apresentar os módulos principais do ClinicBridge. São só alguns passos!',
  },
  {
    id: 'ob-nav',
    tab: 'agenda',
    targetId: 'nav-agenda',
    mood: 'happy',
    title: 'Menu principal',
    body: 'Use as abas para navegar entre Agenda, Pacientes, Financeiro e muito mais.',
    placement: 'bottom',
  },
  {
    id: 'ob-agenda',
    tab: 'agenda',
    targetId: 'agenda-summary',
    mood: 'happy',
    title: 'Agenda',
    body: 'O resumo do dia mostra agendados, confirmados e faltas num relance.',
  },
  {
    id: 'ob-agenda-filters',
    tab: 'agenda',
    targetId: 'agenda-filters',
    mood: 'happy',
    title: 'Filtros da agenda',
    body: 'Filtre por profissional, serviço ou situação para encontrar rápido.',
  },
  {
    id: 'ob-patients',
    tab: 'pacientes',
    targetId: 'patients-search',
    mood: 'happy',
    title: 'Pacientes',
    body: 'Busque qualquer paciente por nome, e-mail ou telefone.',
  },
  {
    id: 'ob-financial',
    tab: 'financeiro',
    targetId: 'financial-summary',
    mood: 'happy',
    title: 'Financeiro',
    body: 'Cobranças em aberto, vencidas e recebidas no período, sempre atualizadas.',
  },
  {
    id: 'ob-services',
    tab: 'servicos',
    targetId: 'services-list',
    mood: 'happy',
    title: 'Serviços',
    body: 'Consultas, sessões e procedimentos cadastrados aqui aparecem na agenda e nas cobranças.',
  },
  {
    id: 'ob-reports',
    tab: 'relatorios',
    targetId: 'reports-summary',
    mood: 'happy',
    title: 'Relatórios',
    body: 'Resultados de agenda, financeiro e pacientes agrupados por período.',
  },
  {
    id: 'ob-plan',
    tab: 'assinatura',
    targetId: 'nav-assinatura',
    mood: 'happy',
    title: 'Plano e assinatura',
    body: 'Veja os módulos habilitados e os limites do plano da clínica.',
    placement: 'bottom',
  },
  {
    id: 'ob-done',
    tab: null,
    targetId: null,
    mood: 'cheer',
    title: 'Pronto! 🎉',
    body: 'Você já conhece o essencial. Explore à vontade — qualquer dúvida, abra o tour de novo.',
  },
];

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
    body: 'A etiqueta colorida mostra se é particular, convênio ou misto.',
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
  // Demo mode: called when user clicks a closing CTA (e.g. "Criar conta").
  // Optional in app (non-demo) mode — use onClose instead.
  onExitTo?: (path: string) => void;
  // App (non-demo) mode: called when the user dismisses or finishes the tour.
  onClose?: () => void;
  // Custom step list. Defaults to DEMO_TOUR_STEPS when omitted.
  steps?: DemoTourStep[];
  // Header role label. Defaults to "guia da demonstração".
  roleLabel?: string;
}

export function GuidedDemoTour({
  step,
  setStep,
  collapsed,
  setCollapsed,
  onExitTo,
  onClose,
  steps: propSteps,
  roleLabel,
}: Props): JSX.Element {
  // App mode: custom steps + close callback. Demo mode: DEMO_TOUR_STEPS + exit callbacks.
  const steps = propSteps ?? DEMO_TOUR_STEPS;
  const isAppMode = onClose !== undefined;
  const effectiveRoleLabel = roleLabel ?? 'guia da demonstração';

  const total = steps.length;
  const safeStep = Math.min(Math.max(step, 0), total - 1);
  const current = steps[safeStep];
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

  // In app (onboarding) mode the X button already called onClose — the parent
  // unmounts this component. In demo mode the bubble stays for re-expanding.
  if (collapsed && !isAppMode) {
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
              <span className={styles.role}>{effectiveRoleLabel}</span>
            </span>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => { setCollapsed(true); if (isAppMode) onClose?.(); }}
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
              {steps.map((s, i) => (
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

          {/* demoNote is only relevant in Demo Aurora — hidden in app (onboarding) mode. */}
          {current.demoNote && !isAppMode && (
            <p className={styles.demoNote}>
              <Lock size={13} className={styles.demoNoteIcon} aria-hidden="true" />
              <span>{current.demoNote}</span>
            </p>
          )}

          {isLast && !isAppMode && (
            <div className={styles.ctaCol}>
              <button type="button" className={styles.ctaPrimary} onClick={() => onExitTo?.('/register')}>
                <UserPlus size={15} aria-hidden="true" />
                Criar conta
              </button>
              <button type="button" className={styles.ctaGhost} onClick={() => onExitTo?.('/register')}>
                <FileSearch size={15} aria-hidden="true" />
                Preparar arquivo de teste
              </button>
              <button type="button" className={styles.ctaGhost} onClick={() => onExitTo?.('/#planos')}>
                <HeartHandshake size={15} aria-hidden="true" />
                Conhecer o piloto assistido
              </button>
            </div>
          )}

          {isLast && isAppMode && (
            <button type="button" className={styles.ctaPrimary} onClick={onClose}>
              Fechar tour
            </button>
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
