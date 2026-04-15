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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://submify.vercel.app'),
  title: {
    default: 'Submify | Easy HTML Form Backend for Static Sites',
    template: '%s | Submify'
  },
  description:
    'Submify is an easy HTML form backend for static websites. Collect form submissions, manage projects, export data, and add optional Telegram and S3 integrations.',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Submify',
    title: 'Submify | Easy HTML Form Backend for Static Sites',
    description:
      'Connect your HTML forms to a reliable backend without writing server code. View submissions in a dashboard, export data, and scale with optional integrations.'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Submify | Easy HTML Form Backend for Static Sites',
    description:
      'Connect HTML forms to a backend endpoint, track submissions in a dashboard, and export with ease.'
  }
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
