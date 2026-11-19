import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { WebView } from 'react-native-webview';
import { exportFile, pickFile } from './files';
import LaunchScreen from './LaunchScreen';
import { isOAuthLaunch, isWorkspace, readOAuthCallback, startsDocument } from './workspace';

const production = __DEV__ ? process.env.EXPO_PUBLIC_SEEKGRN_PLAY === '1' : Updates.channel !== 'preview';
const liveOrigin = 'https://seek.paysme.site';
const localOrigin = __DEV__ && process.env.EXPO_PUBLIC_SEEKGRN_DEV_ORIGIN?.replace(/\/$/, '');
const origin = localOrigin && /^https?:\/\/[\w.-]+(?::\d+)?$/.test(localOrigin) ? localOrigin : liveOrigin;
const mode = production ? 'play' : 'preview';
const oauthSupported = !__DEV__;
const appAgent = `SeekGRNApp/1-${production ? 'Play' : 'Preview'}${oauthSupported ? ' SeekGRNOAuth/1' : ''}`;
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
  const oauth = useRef(null);
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

  function finishOAuth(code, error) {
    const pending = oauth.current;
    if (!pending) return;
    oauth.current = null;
    clearTimeout(pending.timeout);
    clearTimeout(pending.returnTimer);
    pending.respond(code, error);
  }

  useEffect(() => {
    if (!oauthSupported) return;
    const links = Linking.addEventListener('url', ({ url }) => {
      if (!oauth.current) return;
      const result = readOAuthCallback(url);
      if (result) finishOAuth(result.code ?? null, result.error);
    });
    const appState = AppState.addEventListener('change', state => {
      const pending = oauth.current;
      if (!pending) return;
      clearTimeout(pending.returnTimer);
      if (state === 'background') pending.leftApp = true;
      if (state === 'active' && pending.leftApp) {
        // Give Android time to deliver the return URL when coming back from the browser.
        pending.returnTimer = setTimeout(() => finishOAuth(null), 1500);
      }
    });
    return () => {
      links.remove();
      appState.remove();
      finishOAuth(null);
    };
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
    finishOAuth(null);
    const message = launchError(reason, statusCode);
    setError(current => reason === 'bridge-missing' ? current || message : message);
    setScreen('unavailable');
  }

  function retry() {
    session.current = null;
    finishOAuth(null);
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
    if (message.action === 'oauth-sign-in') {
      if (!oauthSupported || !isOAuthLaunch(message.url)) return respond(null, 'Unable to open this sign-in request.');
      if (oauth.current) return respond(null, 'Finish the open sign-in request first.');
      oauth.current = { respond, timeout: setTimeout(() => finishOAuth(null, 'Sign-in timed out. Please try again.'), 8 * 60 * 1000) };
      try {
        await Linking.openURL(message.url);
      } catch {
        finishOAuth(null, 'Unable to open the browser for sign-in.');
      }
      return;
    }
    busy.current = true;
    try {
      switch (message.action) {
        case 'pick-pdf': respond(await pickFile()); break;
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
      <StatusBar barStyle={screen === 'ready' ? 'dark-content' : 'light-content'} />
      <SafeAreaView style={styles.content}>
        <View style={styles.content}>
          <WebView
            key={attempt}
            ref={web}
            source={source}
            applicationNameForUserAgent={appAgent}
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
              finishOAuth(null);
              setError('');
              setScreen('loading');
            }}
            injectedJavaScript={launchProbe}
            onMessage={onMessage}
            onError={() => fail('network')}
            onHttpError={({ nativeEvent }) => { if (isWorkspace(origin, nativeEvent.url)) fail('http', nativeEvent.statusCode); }}
            onRenderProcessGone={() => fail('workspace-error')}
          />
        </View>
      </SafeAreaView>
      {screen !== 'ready' && <LaunchScreen error={error} onRetry={retry} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, backgroundColor: '#FAF9F4' },
  hidden: { opacity: 0 },
});
