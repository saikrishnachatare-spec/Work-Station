import { z } from 'zod';

import { COURSES } from './constants';

/** Onboarding profile form. */
export const profileSchema = z.object({
  city: z.string().trim().max(80).optional(),
  course: z.enum(COURSES).optional(),
  fullName: z.string().trim().min(1).max(120),
  level: z.string().trim().max(40).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
