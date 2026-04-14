'use client';

import { CONTACT_SUBMIT_API_PATH } from '@/lib/contactSubmitPath';
import { FormEvent, useState } from 'react';

export function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setMessage('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const gotcha = String(fd.get('gotcha') ?? '');
    const payload = {
      name: String(fd.get('name') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      message: String(fd.get('message') ?? '').trim(),
      company: String(fd.get('company') ?? '').trim(),
      gotcha
    };

    try {
      const res = await fetch(CONTACT_SUBMIT_API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok) {
        setStatus('error');
        setMessage(typeof data.error === 'string' ? data.error : 'Something went wrong.');
        return;
      }

      setStatus('success');
      setMessage('Thanks — we received your message.');
      form.reset();
    } catch {
      setStatus('error');
      setMessage('Network error. Check your connection and try again.');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative mx-auto max-w-lg space-y-4 rounded-2xl border border-slate-200/90 bg-white/90 p-6 shadow-lg shadow-slate-200/50 backdrop-blur-sm sm:p-8"
      noValidate
    >
      <div className="space-y-1">
        <label htmlFor="contact-name" className="text-sm font-medium text-slate-800">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          required
          autoComplete="name"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none ring-brand-500/20 transition focus:border-indigo-300 focus:ring-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="contact-email" className="text-sm font-medium text-slate-800">
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none ring-brand-500/20 transition focus:border-indigo-300 focus:ring-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="contact-company" className="text-sm font-medium text-slate-800">
          Company <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="contact-company"
          name="company"
          autoComplete="organization"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none ring-brand-500/20 transition focus:border-indigo-300 focus:ring-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="contact-message" className="text-sm font-medium text-slate-800">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={4}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none ring-brand-500/20 transition focus:border-indigo-300 focus:ring-2"
        />
      </div>
      {/* Honeypot — leave off-screen; tabIndex -1 so keyboard users skip */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="contact-gotcha">Do not fill</label>
        <input id="contact-gotcha" name="gotcha" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>

      {status === 'success' ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900" role="status">
          {message}
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
