import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  CalendarDays,
  Wallet,
  Boxes,
  BarChart3,
  ClipboardList,
  UserPlus,
  ShieldCheck,
  Play,
  ArrowRight,
  AlertCircle,
  LogIn,
  Presentation,
  Loader2,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { Footer } from '../components/Footer';
import { DemoMascot } from '../components/DemoMascot';
import { useAuth } from '../services/AuthProvider';
import { ApiError } from '../services/api';
import styles from './DemoPage.module.css';

const MODULES = [
  {
    icon: Users,
    title: 'Pacientes e importação',
    desc: 'Importação de arquivo do sistema antigo, revisão de duplicados e exportação limpa. A demo já tem pacientes fictícios cadastrados.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda e serviços',
    desc: 'Profissionais, tipos de atendimento e agendamentos da semana com situações variadas — confirmado, concluído e faltou.',
  },
  {
    icon: Wallet,
    title: 'Financeiro e convênios',
    desc: 'Cobranças de exemplo: particular, convênio e misto. Operadoras e planos fictícios com carteirinhas de pacientes.',
  },
  {
    icon: Boxes,
    title: 'Estoque',
    desc: 'Materiais e insumos da clínica com entradas, saídas e dois itens com alerta de quantidade baixa.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios',
    desc: 'Resumos de agenda, recebimentos e pacientes por período. Visão cruzada entre agenda e financeiro.',
  },
  {
    icon: ClipboardList,
    title: 'Prontuário e documentos',
    desc: 'Exemplos de atendimento clínico para mostrar o controle de acesso por perfil e o registro de auditoria. Sem nenhum dado clínico real.',
  },
];

const AURORA_ITEMS = [
  'Médico(a) e psicóloga(s) com perfis de acesso distintos',
  'Pacientes fictícios com agenda preenchida',
  'Cobranças particulares, convênio e misto',
  'Convênios e carteirinhas de exemplo',
  '7 itens de estoque (2 com alerta de baixo estoque)',
  'Relatórios com dados do mês corrente',
  'Prontuário e documentos de exemplo, sem validade clínica ou legal',
];

const SAFETY_ITEMS = [
  'Nenhum CPF real',
  'Nenhum telefone ou e-mail real',
  'Nenhum caso clínico real',
  'Prontuário e documentos são apenas exemplos',
  'Acesso de demonstração não expõe dados reais',
  'Produção com dados reais exige uma etapa própria de segurança',
];

const ACCESS_CARDS = [
  {
    icon: Presentation,
    title: 'Demo guiada',
    desc: 'Entre direto na Clínica Demo Aurora e siga um tour passo a passo pelos principais módulos. Tudo com dados fictícios.',
    cta: 'Entrar na demo guiada',
    action: 'demo' as const,
  },
  {
    icon: UserPlus,
    title: 'Criar uma conta de teste',
    desc: 'Prefere começar do zero? Crie sua conta e explore o ClinicBridge com seus próprios dados de teste.',
    cta: 'Criar conta',
    action: 'link' as const,
    to: '/register',
  },
  {
    icon: LogIn,
    title: 'Acesso interno',
    desc: 'É da equipe do projeto? Entre com suas credenciais internas. As credenciais da demo ficam nos documentos internos, nunca nesta página.',
    cta: 'Entrar',
    action: 'link' as const,
    to: '/login',
  },
];

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

export function DemoPage(): JSX.Element {
  const navigate = useNavigate();
  const { enterDemo } = useAuth();
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);

  async function handleEnterDemo(): Promise<void> {
    if (entering) return;
    setEnterError(null);
    setEntering(true);
    try {
      await enterDemo();
      navigate('/app', { replace: true });
    } catch (err) {
      setEntering(false);
      if (err instanceof ApiError && (err.code === 'demo_disabled' || err.status === 403)) {
        setEnterError('Demo guiada disponível apenas em ambiente preparado. Fale com a nossa equipe para agendar uma apresentação.');
      } else if (err instanceof ApiError && err.code === 'demo_not_available') {
        setEnterError('A demonstração ainda está sendo preparada neste ambiente. Tente novamente em instantes.');
      } else {
        setEnterError('Não foi possível abrir a demonstração agora. Tente novamente em instantes.');
      }
    }
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand} aria-label="ClinicBridge — início">
            <Logo size={24} />
            <span>ClinicBridge</span>
          </Link>
          <nav className={styles.headerNav} aria-label="Demo navigation">
            <Link to="/" className={styles.headerNavLink}>Início</Link>
            <Link to="/#planos" className={styles.headerNavLink}>Planos</Link>
          </nav>
          <Link to="/register" className={styles.headerCta} aria-label="Criar conta">
            <UserPlus size={15} aria-hidden="true" />
            Criar conta
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <motion.div
            className={styles.heroInner}
            {...fadeUp}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <span className={styles.badge}>
              <AlertCircle size={13} aria-hidden="true" />
              Demo · dados 100% fictícios
            </span>
            <h1 className={styles.heroTitle}>
              Veja o ClinicBridge{' '}
              <span className={styles.heroAccent}>em ação</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Conheça os principais módulos usando uma clínica fictícia, criada só para demonstração.
              Nenhum paciente real é usado.
            </p>
            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleEnterDemo}
                disabled={entering}
                aria-label="Entrar na demo guiada"
              >
                {entering ? (
                  <>
                    <Loader2 size={16} className="spin" aria-hidden="true" />
                    Preparando…
                  </>
                ) : (
                  <>
                    <LogIn size={16} aria-hidden="true" />
                    Entrar na demo guiada
                  </>
                )}
              </button>
              <Link to="/register" className={styles.btnGhost} aria-label="Criar conta no ClinicBridge">
                <UserPlus size={16} aria-hidden="true" />
                Criar conta
              </Link>
            </div>
            {enterError && (
              <p className={styles.heroError} role="alert">
                {enterError}
              </p>
            )}
          </motion.div>
        </section>

        {/* ── Vídeo placeholder ── */}
        <section className={`section ${styles.videoSection}`}>
          <div className="section-inner">
            <motion.div
              className={styles.videoPlaceholder}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <div className={styles.videoIcon} aria-hidden="true">
                <Play size={28} strokeWidth={1.5} />
              </div>
              <h2 className={styles.videoTitle}>Vídeo guiado em breve</h2>
              <p className={styles.videoDesc}>
                Em breve, esta área terá um vídeo curto mostrando a rotina da clínica dentro do
                ClinicBridge.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── Módulos ── */}
        <section className="section" id="modulos">
          <div className="section-inner">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <span className="eyebrow">Módulos na demo</span>
              <h2 className="section-title">O que você encontra na demonstração</h2>
              <p className="section-lead">
                Cada módulo já tem exemplos prontos para você explorar o fluxo completo sem
                precisar cadastrar nada do zero.
              </p>
            </motion.div>

            <ul className={styles.moduleGrid}>
              {MODULES.map((m, i) => {
                const Icon = m.icon;
                return (
                  <motion.li
                    key={m.title}
                    className={styles.moduleCard}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.45, delay: i * 0.06, ease: 'easeOut' }}
                  >
                    <div className={styles.moduleIcon} aria-hidden="true">
                      <Icon size={20} strokeWidth={1.7} />
                    </div>
                    <h3 className={styles.moduleTitle}>{m.title}</h3>
                    <p className={styles.moduleDesc}>{m.desc}</p>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ── Clínica Demo Aurora ── */}
        <section className={`section section--surface ${styles.auroraSection}`}>
          <div className="section-inner">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <span className="eyebrow">Cenário de demonstração</span>
              <h2 className="section-title">Clínica Demo Aurora</h2>
              <p className="section-lead">
                Criamos uma clínica fictícia para mostrar como o ClinicBridge funciona na prática:
                agenda, pacientes, cobranças, convênios, estoque, relatórios e prontuário de exemplo.
              </p>
            </motion.div>

            <motion.ul
              className={styles.auroraList}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            >
              {AURORA_ITEMS.map((item) => (
                <li key={item} className={styles.auroraItem}>
                  <ShieldCheck size={14} className={styles.auroraIcon} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </motion.ul>

            <motion.p
              className={styles.auroraNote}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              O acesso de demonstração é preparado em ambiente controlado. Nenhum dado real é
              carregado ou exposto.
            </motion.p>
          </div>
        </section>

        {/* ── Segurança dos dados ── */}
        <section className="section">
          <div className="section-inner">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <span className="eyebrow">Segurança e privacidade</span>
              <h2 className="section-title">Demo segura, sem dados reais</h2>
              <p className="section-lead">
                A demonstração foi montada para apresentar o sistema sem usar informações de
                pacientes reais.
              </p>
            </motion.div>

            <motion.ul
              className={styles.safetyList}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            >
              {SAFETY_ITEMS.map((item) => (
                <li key={item} className={styles.safetyItem}>
                  <ShieldCheck size={14} className={styles.safetyIcon} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </motion.ul>
          </div>
        </section>

        {/* ── Como acessar ── */}
        <section className="section" id="acesso">
          <div className="section-inner">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <span className="eyebrow">Como acessar</span>
              <h2 className="section-title">Como acessar a demonstração</h2>
              <p className="section-lead">
                A demonstração é liberada em ambiente controlado, usando uma clínica fictícia e
                dados de exemplo. Você pode criar sua própria conta de teste ou solicitar uma
                apresentação guiada.
              </p>
            </motion.div>

            <ul className={styles.accessGrid}>
              {ACCESS_CARDS.map((card, i) => {
                const Icon = card.icon;
                return (
                  <motion.li
                    key={card.title}
                    className={styles.accessCard}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.45, delay: i * 0.07, ease: 'easeOut' }}
                  >
                    <div className={styles.accessIcon} aria-hidden="true">
                      <Icon size={20} strokeWidth={1.7} />
                    </div>
                    <h3 className={styles.accessTitle}>{card.title}</h3>
                    <p className={styles.accessDesc}>{card.desc}</p>
                    {card.action === 'demo' ? (
                      <button
                        type="button"
                        className={styles.accessCta}
                        onClick={handleEnterDemo}
                        disabled={entering}
                      >
                        {entering ? 'Preparando…' : card.cta}
                        <ArrowRight size={13} aria-hidden="true" />
                      </button>
                    ) : (
                      <Link to={card.to} className={styles.accessCta}>
                        {card.cta}
                        <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ── CTA final ── */}
        <section className={`section ${styles.ctaSection}`}>
          <motion.div
            className={`section-inner ${styles.ctaInner}`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className={styles.ctaMascot} aria-hidden="true">
              <DemoMascot size={64} mood="wave" />
            </div>
            <span className="eyebrow">Comece pela demonstração</span>
            <h2 className={styles.ctaTitle}>Pronto para conhecer o ClinicBridge?</h2>
            <p className={styles.ctaSubtitle}>
              Entre na demo guiada e deixe a Auri te mostrar o sistema em poucos minutos.
            </p>
            <div className={styles.ctaActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleEnterDemo}
                disabled={entering}
                aria-label="Entrar na demo guiada"
              >
                {entering ? (
                  <>
                    <Loader2 size={16} className="spin" aria-hidden="true" />
                    Preparando…
                  </>
                ) : (
                  <>
                    <LogIn size={16} aria-hidden="true" />
                    Entrar na demo guiada
                  </>
                )}
              </button>
              <Link to="/register" className={styles.btnGhost} aria-label="Criar conta">
                <UserPlus size={16} aria-hidden="true" />
                Criar conta
              </Link>
            </div>
            {enterError && (
              <p className={styles.heroError} role="alert">
                {enterError}
              </p>
            )}
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
