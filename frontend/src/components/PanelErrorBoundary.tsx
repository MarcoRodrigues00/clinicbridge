import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './PanelErrorBoundary.module.css';

interface PanelErrorBoundaryProps {
  /** Short, human label of the area being protected (e.g. "Agenda"). Optional. */
  label?: string;
  children: ReactNode;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
}

/**
 * Sprint 6.0L — hardening pré-piloto.
 *
 * Limite de erro por painel: se um painel grande quebrar em runtime, mostramos
 * um card calmo em vez de derrubar o dashboard inteiro (tela branca). NÃO altera
 * o comportamento dos painéis em caminho feliz — só intercepta exceções de render.
 *
 * - Nunca expõe stack trace nem detalhes técnicos ao usuário.
 * - Só loga no console em DEV (sem PII — apenas o label da área e o erro bruto,
 *   que não contém dados de paciente).
 * - Não engole o erro silenciosamente: sempre mostra feedback ao usuário.
 */
export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // DEV-only console log. Em produção ficamos silenciosos no console para não
    // vazar detalhes; o usuário ainda vê o card de erro abaixo.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(
        `[PanelErrorBoundary]${this.props.label ? ` ${this.props.label}` : ''}`,
        error,
        info.componentStack,
      );
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section className={styles.fallback} role="alert">
          <span className={styles.icon}>
            <AlertTriangle size={22} aria-hidden="true" />
          </span>
          <div className={styles.body}>
            <h3 className={styles.title}>Não foi possível carregar esta área</h3>
            <p className={styles.text}>
              Tente atualizar a página. Se o problema continuar, volte mais tarde.
            </p>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
