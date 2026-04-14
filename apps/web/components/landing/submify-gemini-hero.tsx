'use client';

import { GoogleGeminiEffect } from '@/components/ui/google-gemini-effect';
import { useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useRef } from 'react';

const GITHUB_REPO = 'https://github.com/Raktim94/Submify';

export function SubmifyGeminiHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start']
  });

  const pathLengthFirst = useTransform(scrollYProgress, [0, 0.85], [0.2, 1.15]);
  const pathLengthSecond = useTransform(scrollYProgress, [0, 0.85], [0.15, 1.15]);
  const pathLengthThird = useTransform(scrollYProgress, [0, 0.85], [0.1, 1.15]);
  const pathLengthFourth = useTransform(scrollYProgress, [0, 0.85], [0.05, 1.15]);
  const pathLengthFifth = useTransform(scrollYProgress, [0, 0.85], [0, 1.15]);

  const cta = (
    <>
      <a
        href={GITHUB_REPO}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-lg transition hover:bg-slate-100 md:px-5 md:py-2.5 md:text-sm"
      >
        Download on GitHub
      </a>
      <Link
        href="/docs"
        className="pointer-events-auto inline-flex items-center justify-center rounded-full border-2 border-white/40 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-white/20 md:px-5 md:py-2.5 md:text-sm"
      >
        Read the full docs
      </Link>
      <Link
        href="/register"
        className="pointer-events-auto inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:from-indigo-400 hover:to-violet-400 md:px-5 md:py-2.5 md:text-sm"
      >
        Create account
      </Link>
    </>
  );

  return (
    <div
      ref={ref}
      className="relative min-h-[300vh] w-full overflow-clip rounded-none border-b border-white/10 bg-black md:min-h-[320vh]"
    >
      {/* Fade from header (light) into hero */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-white to-transparent"
        aria-hidden
      />

      <div className="relative mx-auto max-w-[100vw] px-4 pb-24 pt-28 md:pt-36">
        <GoogleGeminiEffect
          className="relative z-20"
          pathLengths={[pathLengthFirst, pathLengthSecond, pathLengthThird, pathLengthFourth, pathLengthFifth]}
          title="Submify: Own Your Form Pipeline"
          description="The bridge between your static frontend and your data — self-hosted, with a real dashboard, exports, and alerts. No middleman tax on your submissions."
          cta={cta}
        />
      </div>
    </div>
  );
}
