import { ImageResponse } from 'next/og';

export const alt = 'Submify — self-hosted form backend';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #164e63 100%)',
          color: 'white',
          fontFamily: 'sans-serif'
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 120,
            height: 120,
            borderRadius: 28,
            background: 'linear-gradient(135deg, #6366f1, #14b8a6)',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 64,
            fontWeight: 700,
            marginBottom: 36
          }}
        >
          S
        </div>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>Submify</div>
        <div style={{ display: 'flex', fontSize: 32, marginTop: 20, color: '#c7d2fe' }}>
          Self-hosted form backend for HTML sites
        </div>
      </div>
    ),
    { ...size }
  );
}
