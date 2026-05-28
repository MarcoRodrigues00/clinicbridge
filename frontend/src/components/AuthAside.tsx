import { Users, CalendarDays, ShieldCheck, UploadCloud, ClipboardList } from 'lucide-react';
import styles from '../views/Auth.module.css';

const ITEMS = [
  {
    icon: Users,
    title: 'Pacientes organizados',
    text: 'Importe, revise e mantenha dados administrativos em um só lugar, com CPF mascarado e revisão humana.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda administrativa',
    text: 'Cadastre profissionais, organize horários e acompanhe agendamentos sem criar prontuário clínico.',
  },
  {
    icon: ShieldCheck,
    title: 'Sessão protegida',
    text: 'Acesso por clínica, autenticação, papéis de usuário e logs de auditoria.',
  },
  {
    icon: UploadCloud,
    title: 'Migração e exportação',
    text: 'Trabalhe com CSV/XLSX, duplicados e exportações limpas para continuar usando seus dados com segurança.',
  },
  {
    icon: ClipboardList,
    title: 'Prontuário com regras restritas',
    text: 'Prontuário e documentos v0.1 disponíveis com roles clínicas, auditoria e controle de acesso. Não substitui assinatura ICP-Brasil, TISS ou sistema homologado.',
  },
];

export function AuthAside(): JSX.Element {
  return (
    <aside className={styles.aside} aria-label="Por que usar o ClinicBridge">
      <h2 className={styles.asideTitle}>Gestão administrativa segura para clínicas</h2>
      <ul className={styles.asideList}>
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <li key={title} className={styles.asideItem}>
            <Icon className={styles.asideIcon} size={22} aria-hidden="true" />
            <div>
              <strong>{title}</strong>
              <span>{text}</span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
