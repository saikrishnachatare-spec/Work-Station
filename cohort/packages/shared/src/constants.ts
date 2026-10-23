import type { Course } from './types';

/** Course catalogue, mirroring the prototype and resources design. */
export const COURSES = ['CA', 'CMA', 'CS'] as const;

export const LEVELS: Record<Course, readonly string[]> = {
  CA: ['Foundation', 'Inter', 'Final'],
  CMA: ['Foundation', 'Inter', 'Final'],
  CS: ['Foundation', 'Executive', 'Professional'],
} as const;
