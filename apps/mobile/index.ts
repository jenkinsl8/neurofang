import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createElement } from 'react';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

function ExpoGoUnsupportedApp() {
  return createElement(
    SafeAreaView,
    { style: { flex: 1, backgroundColor: '#111827', padding: 20, justifyContent: 'center' } },
    createElement(Text, { style: { color: 'white', fontSize: 24, marginBottom: 12 } }, 'Dominion Mobile MVP'),
    createElement(
      Text,
      { style: { color: '#fde68a', marginBottom: 8 } },
      'This app requires a custom Expo development client because it depends on native WebRTC modules.'
    ),
    createElement(
      Text,
      { style: { color: '#cbd5e1', marginBottom: 6 } },
      '1) Build/install dev client: npm run ios -w @dominion/mobile'
    ),
    createElement(
      Text,
      { style: { color: '#cbd5e1' } },
      '2) Start Metro in dev-client mode: npm run dev:mobile'
    )
  );
}

if (IS_EXPO_GO) {
  registerRootComponent(ExpoGoUnsupportedApp);
} else {
  const App = require('./src/App').default;
  registerRootComponent(App);
}
