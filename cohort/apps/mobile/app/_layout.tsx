import Ionicons from '@expo/vector-icons/Ionicons';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';

import { ToastProvider } from '@/components/Toast';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/store/session';
import { colors } from '@/theme';

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
        <Text style={{ color: colors.brand, fontFamily: 'Georgia', fontSize: 28 }}>Cohort</Text>
      </View>
    );
  }
  // On web (including the static export pass) render children while the session
  // loads so routes produce real HTML: page content, titles and meta tags.
  return <>{children}</>;
}

export default function RootLayout() {
  // Vector-icon fonts don't load by default on web; without this, tab icons are invisible.
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  if (!fontsLoaded) {
    return <View style={{ backgroundColor: colors.cream, flex: 1 }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <StatusBar style="dark" />
      <AuthGate>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.cream },
            headerTintColor: colors.ink,
            headerStyle: { backgroundColor: colors.cream },
            headerTitleStyle: { fontFamily: 'Georgia' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
          <Stack.Screen name="messages" options={{ title: 'Messages' }} />
          <Stack.Screen name="search" options={{ title: 'Search' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="admin" options={{ title: 'Cohort admin' }} />
          <Stack.Screen name="terms" options={{ title: 'Terms of use' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
          <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
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
      </ToastProvider>
    </QueryClientProvider>
  );
}
