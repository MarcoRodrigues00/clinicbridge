import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { Security } from '../components/Security';
import { Roadmap } from '../components/Roadmap';
import { PricingPlans } from '../components/PricingPlans';
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
        <PricingPlans />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
