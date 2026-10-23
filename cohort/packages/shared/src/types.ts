export type Course = 'CA' | 'CMA' | 'CS';

export type Role = 'student' | 'mentor' | 'firm' | 'moderator';

/** profiles table row (supabase/migrations/0001_profiles.sql). */
export type Profile = {
  id: string;
  fullName: string | null;
  role: Role;
  course: Course | null;
  level: string | null;
  attempt: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
};
