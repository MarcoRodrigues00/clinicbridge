import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { Security } from '../components/Security';
import { Roadmap } from '../components/Roadmap';
import { Validation } from '../components/Validation';
import { FinalCTA } from '../components/FinalCTA';
import { Footer } from '../components/Footer';

export function Landing(): JSX.Element {
  return (
    <>
      <a id="top" />
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Security />
        <Roadmap />
        <Validation />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
