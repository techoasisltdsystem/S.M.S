import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * A full-bleed slideshow for the background of a hero section: the photos cross-fade and drift slowly.
 * It sits behind the content (absolute, -z) and is hidden from assistive technology. With reduced motion
 * it shows the first photo, still.
 */
const HeroBackdrop = ({ images, every = 6000 }: { images: readonly string[]; every?: number }) => {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || images.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % images.length), every);
    return () => window.clearInterval(t);
  }, [reduce, images.length, every]);

  return (
    <div className="absolute inset-0 -z-20 overflow-hidden bg-[#08193a]" aria-hidden>
      <AnimatePresence initial={false}>
        <motion.img
          key={i}
          src={images[i]}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: reduce ? 1.04 : 1.14 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.2 }, scale: { duration: (every + 1200) / 1000, ease: "linear" } }}
        />
      </AnimatePresence>
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
        {images.map((_, n) => (
          <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-white" : "w-1.5 bg-white/40"}`} />
        ))}
      </div>
    </div>
  );
};

export default HeroBackdrop;
