import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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
  const { height } = useWindowDimensions();
  const imageHeight = Math.max(140, Math.min(266, height * 0.30));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.center} accessibilityViewIsModal>
      <View style={styles.layout}>
        <View style={styles.brand}>
          <Image source={require('./assets/icon.png')} style={styles.icon} accessible={false} />
          <Text style={styles.brandText}>SeekGRNJobs</Text>
        </View>
        <View style={styles.artFrame}>
          <Image source={require('./assets/loader-dunes.jpg')} resizeMode="cover" style={[styles.art, { height: imageHeight }]} accessible={false} />
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
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#102F27' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  layout: { width: '100%', maxWidth: 440, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 12, borderColor: '#537266', borderWidth: 1 },
  brandText: { flexShrink: 1, color: '#F7F4E8', fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  artFrame: { backgroundColor: '#3B5345', borderColor: '#5C7566', borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  art: { width: '100%' },
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
