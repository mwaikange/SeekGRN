import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const dunes = require('./assets/loader-dunes.jpg');

function LoadingTrack() {
  const position = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; preference.remove(); };
  }, []);

  useEffect(() => {
    position.setValue(0);
    if (reducedMotion) return;
    const sweep = Animated.loop(Animated.timing(position, {
      toValue: 1,
      duration: 1450,
      easing: Easing.inOut(Easing.sin),
      isInteraction: false,
      useNativeDriver: true,
    }));
    sweep.start();
    return () => sweep.stop();
  }, [position, reducedMotion]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading SeekGRNJobs" style={styles.track} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <Animated.View style={[styles.fill, reducedMotion ? styles.staticFill : {
        transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [-72, width] }) }],
      }]} />
    </View>
  );
}

export default function LaunchScreen({ error, onRetry, onArtworkReady }) {
  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Image source={dunes} resizeMode="cover" style={styles.art} onLoadEnd={onArtworkReady} accessible={false} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.layout}>
          <View style={styles.brand}>
            <Text style={styles.brandText}>SeekGRNJobs</Text>
            <Text accessibilityRole="header" style={styles.heading}>
              Find your place in <Text style={styles.accent}>public service.</Text>
            </Text>
          </View>
          <View style={[styles.status, error && styles.error]} accessibilityLiveRegion="polite">
            {error ? (
              <>
                <Text accessibilityRole="header" style={styles.errorTitle}>Workspace unavailable</Text>
                <Text style={styles.description}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.loadingText}>Loading vacancies…</Text>
                <LoadingTrack />
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#10291F', overflow: 'hidden' },
  art: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  safe: { flex: 1 },
  layout: { flexGrow: 1, justifyContent: 'space-between', alignItems: 'center', gap: 24, paddingHorizontal: 26, paddingTop: 30, paddingBottom: 20 },
  brand: { width: '100%', maxWidth: 440, gap: 8 },
  brandText: { color: '#DCE6CF', fontSize: 18, fontWeight: '700', letterSpacing: 0.35 },
  heading: { maxWidth: 330, color: '#FAF4E4', fontSize: 36, fontWeight: '800', letterSpacing: -1.2 },
  accent: { color: '#F1D39D' },
  status: { width: '100%', maxWidth: 440, gap: 9 },
  loadingText: { color: '#F7F4E8', textAlign: 'center', fontSize: 14, fontWeight: '600' },
  error: { padding: 18, borderRadius: 16, backgroundColor: '#10291F' },
  errorTitle: { color: '#FAF4E4', fontSize: 23, fontWeight: '700' },
  description: { color: '#C4D4CA', fontSize: 15, lineHeight: 22 },
  track: { width: 128, alignSelf: 'center', height: 4, borderRadius: 2, backgroundColor: '#526A56', overflow: 'hidden' },
  fill: { width: 72, height: '100%', borderRadius: 2, backgroundColor: '#F1D39D' },
  staticFill: { width: '35%', alignSelf: 'center' },
  retry: { alignSelf: 'flex-start', borderRadius: 11, paddingHorizontal: 24, paddingVertical: 13, backgroundColor: '#DDE7BD' },
  retryPressed: { backgroundColor: '#C7D6AC' },
  retryText: { color: '#102F27', fontWeight: '700', fontSize: 16 },
});
