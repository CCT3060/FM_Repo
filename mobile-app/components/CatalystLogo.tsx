import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CatalystLogoProps {
  size?: 'small' | 'medium' | 'large';
}

const LETTER_COLORS = ['#1f7bb6', '#0f7e45', '#e97724', '#4f46e5', '#1f7bb6', '#0f7e45', '#e97724', '#4f46e5'];
const LETTERS = ['C', 'A', 'T', 'A', 'L', 'Y', 'S', 'T'];

export default function CatalystLogo({ size = 'medium' }: CatalystLogoProps) {
    const fontSize = size === 'small' ? 18 : size === 'large' ? 32 : 24;
    const subFontSize = size === 'small' ? 8 : size === 'large' ? 11 : 9;
    const paddingV = size === 'small' ? 8 : size === 'large' ? 16 : 12;
    const paddingH = size === 'small' ? 14 : size === 'large' ? 24 : 18;

    return (
        <View style={[styles.container, { paddingVertical: paddingV, paddingHorizontal: paddingH }]}>
            <View style={styles.lettersRow}>
                {LETTERS.map((letter, i) => (
                    <Text key={i} style={[styles.letter, { fontSize, color: LETTER_COLORS[i] }]}>
                        {letter}
                    </Text>
                ))}
            </View>
            <Text style={[styles.tagline, { fontSize: subFontSize }]}>
                PARTNERING FOR SUSTAINABILITY
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        alignItems: 'center',
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
    },
    lettersRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    letter: {
        fontWeight: '800',
        letterSpacing: 1,
    },
    tagline: {
        color: '#6b7280',
        letterSpacing: 1.2,
        marginTop: 3,
        fontWeight: '500',
    },
});
