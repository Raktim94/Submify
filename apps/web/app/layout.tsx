import type { Metadata } from 'next';
import { Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Submify — Self-hosted form backend',
  description:
    'Collect submissions from your sites, review them in a dashboard, export to Excel or PDF, with optional Telegram and S3. Documentation at /docs.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${outfit.variable}`}>
      <body className={`${jakarta.className} antialiased`}>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
