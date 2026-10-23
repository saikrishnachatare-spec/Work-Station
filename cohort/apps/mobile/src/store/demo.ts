/**
 * Shared in-memory demo store. Holds the demo content as live state so the
 * admin panel can edit it and every screen reflects the changes.
 * Phase 2 replaces this with Supabase-backed queries.
 */
import { useSyncExternalStore } from 'react';

import {
  FEED, GROUPS, JOBS, RESOURCES, USERS,
  type DemoUser, type FeedItem, type GroupItem, type Job, type Resource,
} from '@/lib/demo-data';

export type DemoState = {
  feed: FeedItem[];
  groups: GroupItem[];
  jobs: Job[];
  resources: Resource[];
  users: DemoUser[];
};

let state: DemoState = {
  feed: FEED,
  groups: GROUPS,
  jobs: JOBS,
  resources: RESOURCES,
  users: USERS,
};

const listeners = new Set<() => void>();

export function getDemo(): DemoState {
  return state;
}

export function updateDemo(patch: Partial<DemoState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function useDemo<T>(selector: (s: DemoState) => T): T {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => selector(state),
    () => selector(state),
  );
}

let counter = 0;
export function nextId(prefix: string) {
  counter += 1;
  return `${prefix}-new-${Date.now()}-${counter}`;
}
