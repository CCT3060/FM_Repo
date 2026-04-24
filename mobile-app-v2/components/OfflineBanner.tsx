import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { subscribeNetworkStatus, getIsOnline } from '../utils/networkStatus';
import { useTheme, Typography, Spacing } from '../utils/theme';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!getIsOnline());
  const { theme } = useTheme();
  const anim = React.useRef(new Animated.Value(offline ? 1 : 0)).current;

  useEffect(() => {
    return subscribeNetworkStatus((online) => {
      setOffline(!online);
      Animated.timing(anim, { toValue: online ? 0 : 1, duration: 300, useNativeDriver: true }).start();
    });
  }, [anim]);

  if (!offline) return null;

  return (
    <Animated.View style={[styles.banner, { backgroundColor: theme.warning, opacity: anim }]}>
      <Text style={styles.text}>No internet connection — offline mode</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: Spacing.sm, alignItems: 'center' },
  text:   { ...Typography.label, color: '#fff' },
});
