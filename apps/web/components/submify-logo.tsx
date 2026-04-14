import Image from 'next/image';

const LOGO_WIDTH = 512;
const LOGO_HEIGHT = 157;

type Props = {
  className?: string;
  priority?: boolean;
};

export function SubmifyLogo({ className, priority }: Props) {
  return (
    <Image
      src="/brand/submify-logo.png"
      alt="Submify — Self-hosted form backend"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      className={className}
      priority={priority}
      sizes="(max-width: 640px) 220px, min(320px, 40vw)"
    />
  );
}
