import {
  Orbitron_400Regular,
  Orbitron_700Bold,
  Orbitron_900Black,
  useFonts as useOrbitronFonts,
} from '@expo-google-fonts/orbitron';
import {
  ShareTechMono_400Regular,
  useFonts as useShareTechFonts,
} from '@expo-google-fonts/share-tech-mono';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GameProvider } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="waiting" options={{ headerShown: false }} />
      <Stack.Screen name="game" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [orbitronLoaded, orbitronError] = useOrbitronFonts({
    Orbitron_400Regular,
    Orbitron_700Bold,
    Orbitron_900Black,
  });
  const [shareLoaded, shareError] = useShareTechFonts({
    ShareTechMono_400Regular,
  });

  const fontsLoaded = orbitronLoaded && shareLoaded;
  const fontError = orbitronError || shareError;

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GameProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <RootLayoutNav />
          </GestureHandlerRootView>
        </GameProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
