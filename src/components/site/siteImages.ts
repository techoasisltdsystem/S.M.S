import learners from "@/assets/site/learners.webp";
import studyDesk from "@/assets/site/study-desk.webp";
import laptopCity from "@/assets/site/laptop-city.webp";
import laptopBlue from "@/assets/site/laptop-blue.webp";
import schoolHero from "@/assets/school-hero.jpg";
import teacherBg from "@/assets/teacher-login-bg.jpg";
import parentBg from "@/assets/parent-login-bg.jpg";

export const SITE_IMAGES = { learners, studyDesk, laptopCity, laptopBlue, schoolHero, teacherBg, parentBg };

/** Slide sets for each page's hero. */
export const HERO_SETS = {
  home: [schoolHero, learners, laptopCity, studyDesk],
  about: [learners, teacherBg, schoolHero],
  features: [laptopBlue, studyDesk, laptopCity],
  pricing: [laptopCity, schoolHero, studyDesk],
  faq: [studyDesk, parentBg, learners],
  contact: [parentBg, schoolHero, laptopBlue],
} as const;
