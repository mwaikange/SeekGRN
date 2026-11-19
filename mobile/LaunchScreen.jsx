import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const dunes = require('./assets/loader-dunes.jpg');
const dunesSize = Image.resolveAssetSource(dunes);

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

export default function LaunchScreen({ error, onRetry }) {
  const { width, height } = useWindowDimensions();
  const artWidth = Math.max(width, height * dunesSize.width / dunesSize.height);

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Image source={dunes} resizeMode="cover" style={[styles.art, { width: artWidth }]} accessible={false} />
      <View style={styles.shade} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.center}>
          <View style={styles.layout}>
            <View style={styles.brand}>
              <Image source={require('./assets/icon.png')} style={styles.icon} accessible={false} />
              <Text style={styles.brandText}>SeekGRNJobs</Text>
            </View>
            <View style={styles.status} accessibilityLiveRegion="polite">
              <Text accessibilityRole="header" style={styles.heading}>{error ? 'Workspace unavailable' : 'Opening your workspace'}</Text>
              <Text style={styles.description}>{error || 'Loading Namibia’s public service vacancies.'}</Text>
            </View>
            {error ? (
              <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            ) : <LoadingTrack />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#102F27', overflow: 'hidden' },
  art: { position: 'absolute', top: 0, right: 0, height: '100%' },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 29, 24, 0.24)' },
  safe: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  layout: { width: '100%', maxWidth: 440, gap: 18, padding: 22, borderRadius: 18, backgroundColor: 'rgba(10, 29, 24, 0.88)' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 12, borderColor: '#537266', borderWidth: 1 },
  brandText: { flexShrink: 1, color: '#F7F4E8', fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  status: { gap: 7 },
  heading: { color: '#FFFFFF', fontSize: 31, fontWeight: '700', letterSpacing: -0.9 },
  description: { color: '#C4D4CA', fontSize: 15, lineHeight: 22 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#3C594D', overflow: 'hidden' },
  fill: { width: 72, height: '100%', borderRadius: 2, backgroundColor: '#DDE7BD' },
  staticFill: { width: '35%', alignSelf: 'center' },
  retry: { alignSelf: 'flex-start', borderRadius: 11, paddingHorizontal: 24, paddingVertical: 13, backgroundColor: '#DDE7BD' },
  retryPressed: { backgroundColor: '#C7D6AC' },
  retryText: { color: '#102F27', fontWeight: '700', fontSize: 16 },
});
