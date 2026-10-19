import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import LogoCloud from "@/components/landing/LogoCloud";
import FeaturesSection from "@/components/landing/FeaturesSection";
import StatsSection from "@/components/landing/StatsSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import CTASection from "@/components/landing/CTASection";
import FooterSection from "@/components/landing/FooterSection";

const LandingPage = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <HeroSection />
    <LogoCloud />
    <FeaturesSection />
    <StatsSection />
    <TestimonialsSection />
    <PricingSection />
    <CTASection />
    <FooterSection />
  </div>
);

export default LandingPage;
