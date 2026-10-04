import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* Your index.jsx will automatically load here */}
        <Stack.Screen name="index" options={{ title: '' }} />
      </Stack>
    </ThemeProvider>
  );
}