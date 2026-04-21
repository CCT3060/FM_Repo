import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Coming Soon</Text>
                <Text style={styles.subtitle}>This screen is under construction.</Text>
                <TouchableOpacity style={styles.button} onPress={() => router.replace('/checklists')}>
                    <Text style={styles.buttonText}>Go to Tasks</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    title: { fontSize: 24, fontWeight: '700', color: '#1A202C', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#718096', textAlign: 'center', marginBottom: 32 },
    button: { backgroundColor: '#1E3A8A', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 14 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
