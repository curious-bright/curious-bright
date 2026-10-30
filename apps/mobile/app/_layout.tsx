import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { RealtimeBridge } from '../src/components/layout/RealtimeBridge';
import { ToastProvider } from '../src/components/ui/Toast';
import { loadTokens } from '../src/lib/api';
import { startOnlineManager } from '../src/lib/online-manager';
import { queryClient, startQueryPersistence } from '../src/lib/queryClient';
import { AuthProvider, useAuth } from '../src/state/AuthContext';
import { ThemeProvider, darkPalette, lightPalette, useTheme } from '../src/theme';

SplashScreen.preventAutoHideAsync();

startQueryPersistence();

function useAppFonts(): boolean {
  const [loaded] = useFonts({
    ClashDisplay_600: require('../assets/fonts/ClashDisplay-SemiBold.ttf'),
    ClashDisplay_700: require('../assets/fonts/ClashDisplay-Bold.ttf'),
    GeneralSans_400: require('../assets/fonts/GeneralSans-Regular.ttf'),
    GeneralSans_500: require('../assets/fonts/GeneralSans-Medium.ttf'),
    GeneralSans_600: require('../assets/fonts/GeneralSans-SemiBold.ttf'),
    GeneralSans_700: require('../assets/fonts/GeneralSans-Bold.ttf'),
    JetBrainsMono_400: require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
  });
  return loaded;
}

function Gate() {
  const { user, loading, isAuthenticated } = useAuth();
  const { scheme } = useTheme();
  const fontsReady = useAppFonts();

  useEffect(() => {
    void loadTokens();
    return startOnlineManager();
  }, []);

  useEffect(() => {
    if (fontsReady && !loading) void SplashScreen.hideAsync();
  }, [fontsReady, loading]);

  if (!fontsReady || loading) return null;

  const consented =
    !!user?.consent?.terms?.accepted && !!user?.consent?.privacy?.accepted;

  const palette = scheme === 'dark' ? darkPalette : lightPalette;
  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: palette.paper },
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="login" options={{ animation: 'none' }} />
          <Stack.Screen name="register" options={{ animation: 'none' }} />
          <Stack.Screen name="verify-email" options={{ animation: 'none' }} />
          <Stack.Screen name="forgot-password" options={{ animation: 'none' }} />
          <Stack.Screen name="reset-password" options={{ animation: 'none' }} />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated && !consented}>
          <Stack.Screen name="consent" options={{ animation: 'none' }} />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated && consented}>
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: true }} />
          <Stack.Screen name="composer" options={{ presentation: 'modal' }} />
          <Stack.Screen name="search" options={{ presentation: 'modal' }} />
          <Stack.Screen name="submit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="change-password" />
          <Stack.Screen name="profile/[username]" />
          <Stack.Screen name="post/[id]" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <RealtimeBridge />
            <Gate />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
