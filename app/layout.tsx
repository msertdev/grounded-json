import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'grounded-json — Extract structured data. Keep the proof.',
  description:
    'Turn local HTML into schema-valid JSON plus replayable, field-level source evidence.',
  applicationName: 'grounded-json',
  keywords: [
    'structured data',
    'provenance',
    'JSON-LD',
    'evidence',
    'TypeScript',
  ],
  authors: [{ name: 'Murat Sert', url: 'https://github.com/msertdev' }],
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
