import Ionicons from '@expo/vector-icons/Ionicons';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';

import { ConsentBanner } from '@/components/ConsentBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/Toast';
import { getConsent, initAnalytics } from '@/lib/analytics';
import { installErrorLogging } from '@/lib/errors';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/session';
import { colors } from '@/theme';

/** Constant header title container style that keeps SSR HTML and client
 * hydration identical (fixes React error #418). Untyped in native-stack. */
const HYDRATION_SAFE_TITLE_CONTAINER = {
  headerTitleContainerStyle: { maxWidth: '100%' },
} as Record<string, unknown>;

/** Sends unauthenticated, non-guest users to the login screen. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { guest, loading, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    const publicRoutes = ['(auth)', 'terms', 'privacy', 'reset-password'];
    const isPublic = first === undefined || publicRoutes.includes(first);
    if (!session && !guest && !isPublic) {
      router.replace('/(auth)/login');
    }
  }, [guest, loading, router, segments, session]);

  if (loading && Platform.OS !== 'web') {
    return (
      <View style={{ alignItems: 'center', backgroundColor: colors.cream, flex: 1, justifyContent: 'center' }}>
        <Text style={{ color: colors.brand, fontSize: 28, fontWeight: '800' }}>Cohort</Text>
      </View>
    );
  }
  // On web (including the static export pass) render children while the session
  // loads so routes produce real HTML: page content, titles and meta tags.
  return <>{children}</>;
}


/** Records which screens signed-in members open, but only after the member
 * accepts analytics in the consent banner (screen name only, deduped
 * server-side to one row per member per screen per 30 min). Powers the admin
 * usage analytics; never sends params, ids or content. Decline = nothing sent. */
function ScreenTracker() {
  const segments = useSegments();
  const { session } = useAuth();
  const last = useRef('');
  useEffect(() => {
    if (!session || getConsent() !== 'accepted') return;
    const parts = (segments as string[]).filter((s) => s !== '(tabs)' && s !== '(auth)');
    const screen = (parts.length === 0 ? 'home' : parts.map((s) => (/^[0-9a-f-]{8,}$/i.test(s) ? ':id' : s)).join('/')).slice(0, 60);
    if (!screen || screen === last.current) return;
    last.current = screen;
    supabase.rpc('log_screen_view', { p_screen: screen }).then(({ error }) => {
      if (error) last.current = '';
    });
  }, [segments, session]);
  return null;
}

export default function RootLayout() {
  // Vector-icon fonts don't load by default on web; without this, tab icons are invisible.
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  useEffect(() => {
    installErrorLogging();
    initAnalytics();
  }, []);

  if (!fontsLoaded) {
    return <View style={{ backgroundColor: colors.cream, flex: 1 }} />;
  }

  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <StatusBar style="dark" />
      <AuthGate>
        <ScreenTracker />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.cream },
            headerTintColor: colors.ink,
            headerStyle: { backgroundColor: colors.cream },
            headerTitleStyle: { fontWeight: '800' },
            // Hydration safety: react-navigation derives the title container's
            // maxWidth from the measured layout width, which is 0 in the static
            // export pass, so the served HTML carries broken negative values and
            // React hydration mismatches (error #418) on every real page load.
            // A constant renders identically on server and client. The option is
            // consumed by the web header but missing from native-stack types.
            ...HYDRATION_SAFE_TITLE_CONTAINER,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
          <Stack.Screen name="messages" options={{ title: 'Messages' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="search" options={{ title: 'Search' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="safety" options={{ title: 'Report and block' }} />
          <Stack.Screen name="admin" options={{ title: 'Cohort admin' }} />
          <Stack.Screen name="hiring" options={{ title: 'Hiring dashboard' }} />
          <Stack.Screen name="terms" options={{ title: 'Terms of use' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
          <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
          <Stack.Screen name="group-chat" options={{ title: 'Group chat' }} />
          <Stack.Screen name="join" options={{ title: 'Join a group' }} />
          <Stack.Screen name="post" options={{ title: 'Post' }} />
          <Stack.Screen name="member" options={{ title: 'Member profile' }} />
          <Stack.Screen name="job" options={{ title: 'Opening' }} />
          <Stack.Screen
            name="create"
            options={{
              animation: 'slide_from_bottom',
              headerShown: false,
              presentation: 'transparentModal',
            }}
          />
        </Stack>
      </AuthGate>
      <ConsentBanner />
      </ToastProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
