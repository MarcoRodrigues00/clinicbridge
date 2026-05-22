import { FolderCheck, ShieldCheck, UploadCloud, FileX2 } from 'lucide-react';
import styles from '../views/Auth.module.css';

const ITEMS = [
  {
    icon: FolderCheck,
    title: 'Dados organizados',
    text: 'Pacientes, contatos e agenda exportados de sistemas antigos em um formato limpo e revisável.',
  },
  {
    icon: ShieldCheck,
    title: 'Sessão protegida',
    text: 'Acesso por clínica, com autenticação e auditoria desde o início.',
  },
  {
    icon: UploadCloud,
    title: 'Upload CSV/XLSX em breve',
    text: 'A importação de arquivos entra na próxima etapa do MVP.',
  },
  {
    icon: FileX2,
    title: 'Não é prontuário clínico',
    text: 'O ClinicBridge trata apenas dados administrativos — sem diagnósticos ou exames.',
  },
];

export function AuthAside(): JSX.Element {
  return (
    <aside className={styles.aside} aria-label="Por que usar o ClinicBridge">
      <h2 className={styles.asideTitle}>Migração administrativa segura</h2>
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
