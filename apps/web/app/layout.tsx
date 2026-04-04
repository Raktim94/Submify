import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Submify',
  description: 'Self-hosted form backend engine'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
