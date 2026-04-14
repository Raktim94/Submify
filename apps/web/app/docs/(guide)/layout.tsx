import { DocsChrome } from '@/components/docs-chrome';

export default function DocsGuideLayout({ children }: { children: React.ReactNode }) {
  return <DocsChrome>{children}</DocsChrome>;
}
