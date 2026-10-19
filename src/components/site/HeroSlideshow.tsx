import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import learners from "@/assets/site/learners.webp";
import studyDesk from "@/assets/site/study-desk.webp";
import laptopCity from "@/assets/site/laptop-city.webp";
import laptopBlue from "@/assets/site/laptop-blue.webp";

const SLIDES = [
  { src: learners, alt: "Learners working together at a table with laptops", caption: "Learning, organised" },
  { src: studyDesk, alt: "A study desk with an open laptop and notebooks", caption: "Records at your fingertips" },
  { src: laptopCity, alt: "A laptop on a desk with a city view behind it", caption: "Run the school from anywhere" },
  { src: laptopBlue, alt: "A laptop with code on screen next to a mug that reads Better Skills Brighter Future", caption: "Built by Tech Oasis" },
];

const HeroSlideshow = () => {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState(false);
  const startX = useRef<number | null>(null);

  // Autoplay only when the visitor has not asked for reduced motion.
  useEffect(() => {
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const go = useCallback((n: number) => setIndex((n + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (!playing || hover) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 5000);
    return () => window.clearInterval(t);
  }, [playing, hover]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Tech Oasis SMS photo slideshow"
      className="group relative overflow-hidden rounded-2xl border border-border bg-muted shadow-prominent"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        if (e.key === "ArrowRight") go(index + 1);
      }}
      onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (startX.current === null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        startX.current = null;
      }}
    >
      <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
        {SLIDES.map((s, i) => (
          <figure
            key={s.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}`}
            aria-hidden={i !== index}
            className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${i === index ? "opacity-100" : "opacity-0"}`}
          >
            <img
              src={s.src}
              alt={s.alt}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full object-cover"
            />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-5 pb-12 pt-10 text-sm font-medium text-white">
              {s.caption}
            </figcaption>
          </figure>
        ))}
      </div>

      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause slideshow" : "Play slideshow"}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-background/85 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <div className="flex gap-2" role="tablist" aria-label="Choose slide">
          {SLIDES.map((s, i) => (
            <button
              key={s.src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary ${i === index ? "w-6 bg-white" : "w-2 bg-white/60"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeroSlideshow;
