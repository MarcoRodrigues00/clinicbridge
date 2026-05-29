// RolePermissionsGuide — Sprint 6.0H (pré-piloto, polish 6.0H.1). Guia compacto,
// somente leitura, no topo da aba Equipe (já owner-only). NÃO toma decisão de
// segurança e não chama o backend — o backend é a defesa real. Fechado por
// padrão para não dominar a página. Cada permissão reflete o backend ATUAL:
//   - effectiveFinancialAccess: dono/secretaria=full, gestor=transact, profissional=none.
//   - convênios: profissional_clinico → 403 (assertNotProfissional).
//   - estoque: dono=CRUD, secretaria/gestor=ler+movimentar, profissional → 403.
//   - prontuário (ADR 0010+): profissional vê só os próprios; dono/gestor leem a
//     clínica com auditoria; secretaria pura não vê.
// Se mudar regra no backend, ATUALIZE este texto junto.
import { Crown, UserCog, Stethoscope, Eye, Check, Ban, ChevronDown } from 'lucide-react';
import { DemoMascot } from './DemoMascot';
import styles from './RolePermissionsGuide.module.css';

interface Bullet {
  ok: boolean;
  text: string;
}

interface RoleRow {
  key: string;
  icon: JSX.Element;
  name: string;
  tag: 'Login' | 'Acesso concedido';
  bullets: Bullet[]; // máx. 2 — leitura rápida
}

const ROLES: RoleRow[] = [
  {
    key: 'dono',
    icon: <Crown size={16} aria-hidden="true" />,
    name: 'Dono(a)',
    tag: 'Login',
    bullets: [
      { ok: true, text: 'Tudo: clínica, equipe, financeiro, convênios, estoque, relatórios' },
      { ok: true, text: 'Lê o prontuário da clínica (com auditoria)' },
    ],
  },
  {
    key: 'funcionario',
    icon: <UserCog size={16} aria-hidden="true" />,
    name: 'Funcionário(a)',
    tag: 'Login',
    bullets: [
      { ok: true, text: 'Agenda, pacientes, importação; financeiro/convênios/estoque quando liberado' },
      { ok: false, text: 'Não vê o prontuário sem acesso liberado' },
    ],
  },
  {
    key: 'profissional',
    icon: <Stethoscope size={16} aria-hidden="true" />,
    name: 'Profissional clínico',
    tag: 'Acesso concedido',
    bullets: [
      { ok: true, text: 'Só os próprios atendimentos e documentos' },
      { ok: false, text: 'Sem financeiro, convênios ou estoque' },
    ],
  },
  {
    key: 'supervisor',
    icon: <Eye size={16} aria-hidden="true" />,
    name: 'Supervisor',
    tag: 'Acesso concedido',
    bullets: [
      { ok: true, text: 'Lê atendimentos da clínica (auditado); relatórios e financeiro' },
      { ok: false, text: 'Não cria/edita cobranças nem gerencia a equipe' },
    ],
  },
];

export function RolePermissionsGuide(): JSX.Element {
  return (
    // Fechado por padrão (sem `open`): ajuda sob demanda, sem empurrar os painéis
    // de ação (código de convite, solicitações). <details> nativo, sem JS/estado.
    <details className={styles.panel}>
      <summary className={styles.summaryBar}>
        <span className={styles.title}>Papéis e permissões</span>
        <span className={styles.hint}>ver resumo</span>
        <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
      </summary>

      <p className={styles.help}>
        <DemoMascot size={22} mood="happy" className={styles.auri} />
        <span>
          <strong>Dono(a)</strong> e <strong>Funcionário(a)</strong> são logins.{' '}
          <strong>Profissional clínico</strong> e <strong>Supervisor</strong> são
          acessos ao prontuário que você concede a um(a) funcionário(a).
        </span>
      </p>

      <ul className={styles.grid}>
        {ROLES.map((role) => (
          <li key={role.key} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.roleIcon}>{role.icon}</span>
              <span className={styles.roleName}>{role.name}</span>
              <span className={styles.tag}>{role.tag}</span>
            </div>
            <ul className={styles.bullets}>
              {role.bullets.map((b, i) => (
                <li key={i} className={b.ok ? styles.canLine : styles.cannotLine}>
                  {b.ok ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    <Ban size={13} aria-hidden="true" />
                  )}
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <p className={styles.limitNote}>
        Equipe, Profissionais da agenda e Acesso ao prontuário são listas
        separadas — confira as três ao cadastrar alguém.
      </p>
    </details>
  );
}
