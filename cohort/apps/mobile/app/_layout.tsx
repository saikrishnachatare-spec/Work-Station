import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { queryClient } from '@/lib/queryClient';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.cream },
          headerTintColor: colors.ink,
          headerStyle: { backgroundColor: colors.cream },
          headerTitleStyle: { fontFamily: 'Georgia' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="messages" options={{ title: 'Messages' }} />
        <Stack.Screen
          name="create"
          options={{
            animation: 'slide_from_bottom',
            headerShown: false,
            presentation: 'transparentModal',
          }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
