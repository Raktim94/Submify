import { z } from 'zod';

export const contactSubmitSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    email: z.string().trim().email('Valid email required').max(320),
    message: z.string().trim().min(1, 'Message is required').max(10_000),
    company: z.string().trim().max(200).optional(),
    /** Honeypot — must be empty (bots often fill hidden fields). */
    gotcha: z.string().optional()
  })
  .refine((d) => !d.gotcha?.length, {
    message: 'Spam check failed',
    path: ['gotcha']
  });

export type ContactSubmitPayload = z.infer<typeof contactSubmitSchema>;
