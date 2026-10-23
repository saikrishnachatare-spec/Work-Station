import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { env } from './env';

/**
 * Session storage: Expo SecureStore on device (per the technical design),
 * browser localStorage on web.
 */
const storage =
  Platform.OS === 'web'
    ? undefined // supabase-js defaults to localStorage
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      };

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === 'web',
    persistSession: true,
    storage,
  },
});
