import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Champion MLIS',
  description: 'Champion Church — Member Lifecycle Intelligence System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
