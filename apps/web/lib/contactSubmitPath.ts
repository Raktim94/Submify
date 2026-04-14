/**
 * Next.js route for contact submissions (Nodedr proxy).
 * In this monorepo, `POST /api/submit` is reserved for the Go API — use this path behind nginx.
 */
export const CONTACT_SUBMIT_API_PATH = '/api/contact-submit' as const;
