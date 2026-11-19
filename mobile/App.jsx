import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { WebView } from 'react-native-webview';
import { exportFile, pickFile } from './files';
import LaunchScreen from './LaunchScreen';
import { isWorkspace, startsDocument } from './workspace';

const production = __DEV__ ? process.env.EXPO_PUBLIC_SEEKGRN_PLAY === '1' : Updates.channel !== 'preview';
const liveOrigin = 'https://seek.paysme.site';
const localOrigin = __DEV__ && process.env.EXPO_PUBLIC_SEEKGRN_DEV_ORIGIN?.replace(/\/$/, '');
const origin = localOrigin && /^https?:\/\/[\w.-]+(?::\d+)?$/.test(localOrigin) ? localOrigin : liveOrigin;
const mode = production ? 'play' : 'preview';
const source = { uri: `${origin}/?client=${mode}` };
const bridge = 'seekgrn-mobile-v1';
const loadTimeout = 35000;
const launchProbe = `
  if (document.querySelector('meta[name="seekgrn-app-bridge"][content="1"]')) {
    window.seekGrnNativeReady?.();
  } else {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ bridge: '${bridge}', action: 'bridge-missing' }));
  }
  true;
`;

function openExternal(url) {
  const contact = /^(mailto:|tel:)/i.test(url) || /^https:\/\/wa\.me\//i.test(url);
  const payment = !production && /^https:\/\/(www\.)?paysme\.(site|app)\//i.test(url);
  if (contact || payment) Linking.openURL(url).catch(() => Alert.alert('Unable to open this link'));
}

function launchError(reason, statusCode) {
  if (statusCode === 404) return 'The website returned HTTP 404. Check that seek.paysme.site is connected to the SeekGRNJobs Vercel project.';
  if (statusCode) return `The website returned HTTP ${statusCode}. Try again in a moment.`;
  if (reason === 'bridge-missing') return 'The website is online, but its Android support is missing. Check that the latest SeekGRNJobs web release is live.';
  if (reason === 'workspace-error') return 'The website loaded, but the workspace couldn’t start. Try again in a moment.';
  if (reason === 'timeout') return 'The workspace is taking longer than expected. Check your connection and try again.';
  return 'Couldn’t connect to the SeekGRNJobs website. Check your connection and try again.';
}

export default function App() {
  const web = useRef(null);
  const canGoBack = useRef(false);
  const session = useRef(null);
  const pageUrl = useRef(source.uri);
  const busy = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [screen, setScreen] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false;
      web.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (screen !== 'loading') return;
    const timeout = setTimeout(() => {
      setError(launchError('timeout'));
      setScreen('unavailable');
    }, loadTimeout);
    return () => clearTimeout(timeout);
  }, [screen, attempt]);

  function fail(reason, statusCode) {
    session.current = null;
    const message = launchError(reason, statusCode);
    setError(current => reason === 'bridge-missing' ? current || message : message);
    setScreen('unavailable');
  }

  function retry() {
    session.current = null;
    canGoBack.current = false;
    pageUrl.current = source.uri;
    setError('');
    setScreen('loading');
    setAttempt(value => value + 1);
  }

  async function onMessage({ nativeEvent }) {
    // AndroidX reports the sender's bare origin. Older WebViews report a page URL.
    if (!isWorkspace(origin, nativeEvent.url) || !isWorkspace(origin, pageUrl.current) || nativeEvent.data.length > 21 * 1024 * 1024) return;
    let message;
    try { message = JSON.parse(nativeEvent.data); } catch { return; }
    if (message?.bridge !== bridge) return;
    if (message.action === 'bridge-missing' || message.action === 'workspace-error') {
      if (!session.current) fail(message.action);
      return;
    }
    if (!/^[a-z0-9-]{1,80}$/.test(message.session ?? '')) return;
    if (message.action === 'ready' && message.mode === mode) {
      session.current = message.session;
      setScreen('ready');
      return;
    }
    if (message.session !== session.current || !Number.isSafeInteger(message.id)) return;

    function respond(value, error) {
      if (session.current !== message.session) return;
      const response = JSON.stringify({ session: message.session, id: message.id, value, error });
      web.current?.injectJavaScript(`window.seekGrnNativeReply?.(${response}); true;`);
    }

    if (busy.current) return respond(null, 'Finish the open file picker first.');
    busy.current = true;
    try {
      switch (message.action) {
        case 'pick-photo': respond(await pickFile(true)); break;
        case 'pick-pdf': respond(await pickFile(false)); break;
        case 'save':
        case 'share': respond(await exportFile(message)); break;
      }
    } catch (error) {
      respond(null, error.message || 'Unable to complete the file action.');
    } finally {
      busy.current = false;
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safe, screen !== 'ready' && styles.launch]}>
        <StatusBar barStyle={screen === 'ready' ? 'dark-content' : 'light-content'} />
        <View style={styles.content}>
          <WebView
            key={attempt}
            ref={web}
            source={source}
            applicationNameForUserAgent={production ? 'SeekGRNApp/1-Play' : 'SeekGRNApp/1-Preview'}
            style={[styles.content, screen !== 'ready' && styles.hidden]}
            importantForAccessibility={screen === 'ready' ? 'auto' : 'no-hide-descendants'}
            originWhitelist={['*']}
            domStorageEnabled
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            thirdPartyCookiesEnabled={false}
            javaScriptCanOpenWindowsAutomatically={false}
            mediaPlaybackRequiresUserAction
            onShouldStartLoadWithRequest={({ url }) => {
              if (isWorkspace(origin, url)) return true;
              openExternal(url);
              return false;
            }}
            onOpenWindow={({ nativeEvent }) => openExternal(nativeEvent.targetUrl)}
            onNavigationStateChange={state => { canGoBack.current = state.canGoBack; }}
            onLoadStart={({ nativeEvent }) => {
              const previousUrl = pageUrl.current;
              pageUrl.current = nativeEvent.url;
              if (session.current && !startsDocument(previousUrl, nativeEvent)) return;
              session.current = null;
              setError('');
              setScreen('loading');
            }}
            injectedJavaScript={launchProbe}
            onMessage={onMessage}
            onError={() => fail('network')}
            onHttpError={({ nativeEvent }) => { if (isWorkspace(origin, nativeEvent.url)) fail('http', nativeEvent.statusCode); }}
            onRenderProcessGone={() => fail('workspace-error')}
          />
          {screen !== 'ready' && <LaunchScreen error={error} onRetry={retry} />}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF9F4' },
  content: { flex: 1, backgroundColor: '#FAF9F4' },
  launch: { backgroundColor: '#102F27' },
  hidden: { opacity: 0 },
});
