import { ReactNode } from "react";
import { motion } from "framer-motion";
import HeroBackdrop from "@/components/site/HeroBackdrop";

/** The top of every marketing page: a photo slideshow background, a dark overlay and the page's headline. */
const PageHero = ({ images, eyebrow, title, text, children }: { images: readonly string[]; eyebrow: string; title: ReactNode; text: string; children?: ReactNode }) => (
  <section className="relative isolate overflow-hidden text-white">
    <HeroBackdrop images={images} />
    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#08193a]/92 via-[#0a2150]/78 to-[#0a2150]/40" aria-hidden />
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-32 sm:px-6 sm:pb-28 sm:pt-40">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-2xl">
        <p className="mb-4 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur">{eyebrow}</p>
        <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 text-base leading-relaxed text-white/85 sm:text-lg">{text}</p>
        {children && <div className="mt-8 flex flex-col gap-3 sm:flex-row">{children}</div>}
      </motion.div>
    </div>
  </section>
);

export default PageHero;
