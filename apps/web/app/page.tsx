'use client';

import { LandingStory } from '@/components/landing/landing-story';
import { SiteHeader } from '@/components/landing/site-header';
import { SubmifyHero } from '@/components/landing/submify-hero';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBootstrapStatus, isSessionValid } from '@/lib/api';

const GITHUB_REPO = 'https://github.com/Raktim94/Submify';
const SUPPORT_URL = 'https://www.nodedr.com/contactus';

function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
    </svg>
  );
}

function IconKey({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
    </svg>
  );
}

function IconCloud({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinejoin="round" />
    </svg>
  );
}

function IconPortal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" strokeLinecap="round" />
      <circle cx="8.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
      <path d="M8 15l2.5 2.5L16 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const reveal =
  'opacity-0 motion-reduce:opacity-100 motion-reduce:translate-y-0 animate-fade-in-up motion-reduce:animate-none';

export default function HomePage() {
  const [signedIn, setSignedIn] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isSessionValid();
      if (cancelled) return;
      setSignedIn(ok);
      if (!ok) {
        try {
          const b = await getBootstrapStatus();
          if (!cancelled) setSetupRequired(b.setup_required);
        } catch {
          if (!cancelled) setSetupRequired(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen text-slate-800">
      <SiteHeader signedIn={signedIn} setupRequired={setupRequired} />
      <SubmifyHero signedIn={signedIn} setupRequired={setupRequired} />

      <div className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-indigo-50/30">
        <div
          className="pointer-events-none absolute -right-24 top-1/3 h-[380px] w-[380px] rounded-full bg-gradient-to-bl from-cyan-400/15 via-sky-400/10 to-indigo-300/10 blur-3xl"
          aria-hidden
        />

        <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-20">
          <div className={`${reveal}`} style={{ animationDelay: '0ms' }}>
            <LandingStory />
          </div>

          {/* Feature cards */}
          <section className="mt-16">
            <h2
              className={`font-display text-center text-3xl font-bold text-slate-900 sm:text-4xl ${reveal}`}
              style={{ animationDelay: '100ms' }}
            >
              Everything you need
            </h2>
            <p
              className={`mx-auto mt-3 max-w-2xl text-center text-slate-600 ${reveal}`}
              style={{ animationDelay: '160ms' }}
            >
              From first signup to exports — optional integrations when you are ready.
            </p>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: IconUser,
                  title: 'Register',
                  desc: 'Your name, mobile number, email, and a password (8+ characters).',
                  accent: 'from-violet-500 to-purple-600'
                },
                {
                  icon: IconKey,
                  title: 'Dashboard & API key',
                  desc: 'Embed forms with your key. Each project holds up to 5,000 submissions.',
                  accent: 'from-indigo-500 to-blue-600'
                },
                {
                  icon: IconPortal,
                  title: 'Client portal',
                  desc: 'Give clients a password-protected /project-slug page to view and export their own submissions — no dashboard account needed.',
                  accent: 'from-fuchsia-500 to-pink-600'
                },
                {
                  icon: IconSend,
                  title: 'Telegram (optional)',
                  desc: 'Bot token + chat ID in Settings for real-time submission alerts.',
                  accent: 'from-sky-500 to-cyan-600'
                },
                {
                  icon: IconCloud,
                  title: 'S3 storage (optional)',
                  desc: 'Presigned uploads for large files. Small JSON works without it.',
                  accent: 'from-emerald-500 to-teal-600'
                },
                {
                  icon: IconShield,
                  title: 'Security first',
                  desc: 'Public keys for browsers; secret keys plus optional HMAC for servers. Your data never leaves your own infrastructure.',
                  accent: 'from-slate-600 to-slate-800'
                }
              ].map((card) => {
                const FeatureIcon = card.icon;
                return (
                  <article
                    key={card.title}
                    className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-lg shadow-slate-200/40 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-200/30 ${reveal}`}
                  >
                    <div
                      className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent} text-white shadow-lg transition group-hover:scale-110`}
                    >
                      <FeatureIcon className="h-6 w-6" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-slate-900">{card.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.desc}</p>
                  </article>
                );
              })}
            </div>
          </section>

          {/* CTA */}
          <section
            className={`relative mt-24 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700 via-violet-700 to-indigo-800 px-8 py-14 text-center shadow-2xl shadow-indigo-900/30 ${reveal}`}
          >
            <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -right-10 bottom-0 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl" />
            <h2 className="font-display relative text-2xl font-bold text-white sm:text-3xl">Ready to own your form pipeline?</h2>
            <p className="relative mx-auto mt-3 max-w-lg text-indigo-100">
              {signedIn
                ? 'Jump back into your dashboard to manage projects and submissions.'
                : setupRequired
                  ? 'Create an account in seconds — configure Telegram and S3 later from Settings.'
                  : 'Sign in to manage your projects and submissions.'}
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {signedIn ? (
                <Link
                  href="/dashboard"
                  className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-800 shadow-lg transition hover:bg-indigo-50 active:scale-[0.98]"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  {setupRequired ? (
                    <Link
                      href="/register"
                      className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-800 shadow-lg transition hover:bg-indigo-50 active:scale-[0.98]"
                    >
                      Create account
                    </Link>
                  ) : null}
                  <Link
                    href="/login"
                    className="inline-flex min-w-[180px] items-center justify-center rounded-xl border-2 border-white/40 bg-transparent px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </section>

          <footer className="mt-16 border-t border-slate-200/80 pt-8 text-center text-sm text-slate-500">
            <p className="mb-3">Submify — self-hosted form backend. Your keys, your storage, your rules.</p>
            <p className="mx-auto mb-3 max-w-3xl leading-relaxed">
              Built for teams that want data sovereignty, predictable costs, and full control of their form pipeline without platform lock-in.
            </p>
            <p className="mb-2 text-slate-600">
              Made by <strong className="text-slate-800">NODEDR INFOTECH PRIVATE LIMITED</strong>.
            </p>
            <p className="mb-3 text-slate-600">
              <strong className="text-slate-800">RAKTIM RANJIT</strong> — Lead Developer &amp; Founder
            </p>
            <p className="mb-4">
              <a
                href="https://www.nodedr.com"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-700 underline decoration-indigo-300 underline-offset-2 hover:text-brand-900"
              >
                www.nodedr.com
              </a>
            </p>
            <p className="mb-3 text-xs text-slate-500">
              Copyright © {new Date().getFullYear()} NODEDR INFOTECH PRIVATE LIMITED. All rights reserved.
            </p>
            <p>
              <a
                href={`${GITHUB_REPO}#readme`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-700 underline decoration-indigo-300 underline-offset-2 hover:text-brand-900"
              >
                Documentation
              </a>{' '}
              ·{' '}
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-700 underline decoration-indigo-300 underline-offset-2 hover:text-brand-900"
              >
                Support
              </a>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
