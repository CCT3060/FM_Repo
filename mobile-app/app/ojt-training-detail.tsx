import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    completeOjtModule,
    getOjtTrainingDetail,
    startOjtTraining,
    submitOjtTest,
    API_BASE,
} from '../utils/api';

type ScreenView = 'modules' | 'test' | 'result';

interface OjtContent { id: number; type: string; url?: string; description?: string; }
interface OjtModule { id: number; title: string; description?: string; orderNumber: number; contents: OjtContent[]; }
interface OjtQuestion { id: number; question: string; options?: string | string[]; correctAnswer?: string; marks: number; }
interface Training {
    id: number;
    title: string;
    description?: string;
    passingPercentage: number;
    assetName?: string;
    modules: OjtModule[];
    test?: { id: number; totalMarks: number; questions: OjtQuestion[] } | null;
    category?: string;
    estimatedDurationMinutes?: number;
    isSequential?: boolean;
    maxAttempts?: number;
    myProgress?: {
        id?: number;
        status: string;
        score?: number;
        certificateUrl?: string;
        completedModules?: number[];
        startedAt?: string;
        completedAt?: string;
        dueDate?: string;
        attemptNumber?: number;
        trainerSignOffAt?: string;
    } | null;
}

function ContentIcon({ type }: { type: string }) {
    if (type === 'video') return <MaterialCommunityIcons name="play-circle-outline" size={20} color="#2563EB" />;
    if (type === 'document') return <MaterialCommunityIcons name="file-document-outline" size={20} color="#CA8A04" />;
    return <MaterialCommunityIcons name="text-box-outline" size={20} color="#7C3AED" />;
}

function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function VideoPlayer({ uri, onComplete }: { uri: string; onComplete?: () => void }) {
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const completedRef = useRef(false);

    const player = useVideoPlayer({ uri }, p => {
        p.loop = false;
        p.timeUpdateEventInterval = 0.5;
    });

    useEffect(() => {
        const timeSub = player.addListener('timeUpdate', (payload) => {
            const dur = player.duration;
            if (dur > 0) {
                const pct = Math.min(100, Math.round((payload.currentTime / dur) * 100));
                setProgress(pct);
                setCurrentTime(payload.currentTime);
                setDuration(dur);
            }
        });
        const endSub = player.addListener('playToEnd', () => {
            setProgress(100);
            if (!completedRef.current) {
                completedRef.current = true;
                onComplete?.();
            }
        });
        return () => {
            timeSub.remove();
            endSub.remove();
        };
    }, [player]);

    return (
        <View>
            <VideoView
                player={player}
                style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 8, backgroundColor: '#000' }}
                allowsFullscreen
                allowsPictureInPicture
            />
            <View style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>{formatTime(currentTime)}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: progress === 100 ? '#16A34A' : '#2563EB' }}>
                        {progress}% watched
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>{duration > 0 ? formatTime(duration) : '--:--'}</Text>
                </View>
                <View style={{ height: 5, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{
                        height: '100%',
                        width: `${progress}%`,
                        backgroundColor: progress === 100 ? '#16A34A' : '#2563EB',
                        borderRadius: 3,
                    }} />
                </View>
            </View>
        </View>
    );
}

function getOptions(q: OjtQuestion): string[] {
    if (!q.options) return [];
    if (Array.isArray(q.options)) return q.options;
    try { return JSON.parse(q.options as string); } catch { return []; }
}

function isYouTubeUrl(url: string): boolean {
    return /youtube\.com|youtu\.be/i.test(url);
}

function getYouTubeId(url: string): string | null {
    // Match v=ID param (most common)
    const vParam = url.match(/[?&]v=([ \w-]{11})/i);
    if (vParam) return vParam[1].trim();
    // Match youtu.be/ID or /embed/ID or /shorts/ID
    const pathMatch = url.match(/(?:youtu\.be\/|embed\/|shorts\/v\/|shorts\/)([ \w-]{11})/i);
    if (pathMatch) return pathMatch[1].trim();
    return null;
}

function getVimeoEmbedUrl(url: string): string | null {
    const m = url.match(/vimeo\.com\/(?:video\/)?([\d]+)/i);
    return m ? `https://player.vimeo.com/video/${m[1]}?autoplay=1` : null;
}

function getDailymotionEmbedUrl(url: string): string | null {
    const m = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/i);
    return m ? `https://www.dailymotion.com/embed/video/${m[1]}?autoplay=1` : null;
}

function EmbeddedVideoPlayer({ url, onComplete }: { url: string; onComplete?: () => void }) {
    const ytId = isYouTubeUrl(url) ? getYouTubeId(url) : null;
    const vimeoUrl = getVimeoEmbedUrl(url);
    const dmUrl = getDailymotionEmbedUrl(url);
    const calledRef = useRef(false);

    const markWatched = () => { if (!calledRef.current) { calledRef.current = true; onComplete?.(); } };

    // YouTube — never embed (Error 153 = owner disabled embedding).
    // Show thumbnail and open in YouTube app or browser.
    if (isYouTubeUrl(url)) {
        const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
        const openYouTube = async () => {
            if (ytId) {
                const appUrl = `youtube://watch?v=${ytId}`;
                const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
                if (canOpen) { await Linking.openURL(appUrl); return; }
            }
            await WebBrowser.openBrowserAsync(url);
        };
        return (
            <View style={{ marginTop: 8 }}>
                <TouchableOpacity onPress={openYouTube} activeOpacity={0.85}>
                    <View style={{ borderRadius: 8, overflow: 'hidden', backgroundColor: '#1a1a1a', height: 210, justifyContent: 'center', alignItems: 'center' }}>
                        {thumbUrl && (
                            <Image
                                source={{ uri: thumbUrl }}
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                resizeMode="cover"
                            />
                        )}
                        <View style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            justifyContent: 'center', alignItems: 'center',
                        }}>
                            <View style={{
                                backgroundColor: '#FF0000', borderRadius: 10,
                                paddingHorizontal: 18, paddingVertical: 10,
                                flexDirection: 'row', alignItems: 'center', gap: 8,
                            }}>
                                <MaterialCommunityIcons name="youtube" size={22} color="#fff" />
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Watch on YouTube</Text>
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={markWatched} style={{ marginTop: 6, alignSelf: 'flex-end', backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '600' }}>✓ Mark video watched</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Vimeo / DailyMotion — WebView embed
    const embedUrl = vimeoUrl || dmUrl;
    if (embedUrl) {
        return (
            <View style={{ marginTop: 8 }}>
                <WebView
                    source={{ uri: embedUrl }}
                    style={{ width: '100%', height: 210, borderRadius: 8, backgroundColor: '#000' }}
                    allowsFullscreenVideo
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                    javaScriptEnabled
                />
                <TouchableOpacity onPress={markWatched} style={{ marginTop: 6, alignSelf: 'flex-end', backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '600' }}>✓ Mark video watched</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Unknown external URL — open in browser
    return (
        <View style={{ marginTop: 8 }}>
            <TouchableOpacity
                onPress={() => WebBrowser.openBrowserAsync(url)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#BFDBFE' }}
            >
                <MaterialCommunityIcons name="play-circle" size={22} color="#2563EB" />
                <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 13, flex: 1 }}>▶ Open Video in Browser</Text>
                <MaterialCommunityIcons name="open-in-new" size={16} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={markWatched} style={{ marginTop: 6, alignSelf: 'flex-end', backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '600' }}>✓ Mark video watched</Text>
            </TouchableOpacity>
        </View>
    );
}

export default function OjtTrainingDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [training, setTraining] = useState<Training | null>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<ScreenView>('modules');
    const [starting, setStarting] = useState(false);
    const [completingModule, setCompletingModule] = useState<number | null>(null);
    const [expandedModule, setExpandedModule] = useState<number | null>(null);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [testResult, setTestResult] = useState<{ score: number; passed: boolean; earned: number; totalMarks: number; passingPct: number; attemptNumber?: number; attemptsRemaining?: number; maxAttempts?: number } | null>(null);
    const scrollRef = useRef<ScrollView>(null);

    const loadTraining = async () => {
        setLoading(true);
        try {
            const data = await getOjtTrainingDetail(id!);
            setTraining(data);
            // expand first incomplete module
            if (data.modules?.length) setExpandedModule(data.modules[0].id);
        } catch (e) {
            Alert.alert('Error', 'Failed to load training details');
            router.back();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (id) loadTraining(); }, [id]);

    if (loading || !training) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingText}>Loading training...</Text>
                </View>
            </SafeAreaView>
        );
    }

    const progress = training.myProgress;
    const completedModuleIds: number[] = Array.isArray(progress?.completedModules) ? progress!.completedModules : [];
    const totalModules = training.modules.length;
    const completedCount = completedModuleIds.length;
    const allModulesDone = completedCount >= totalModules;
    const progressPct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;
    const hasTest = !!training.test?.questions?.length;
    const isCertified = !!progress?.certificateUrl;
    const isCompleted = progress?.status === 'completed';
    const hasFailed = progress?.status === 'failed';
    const maxAttempts = training.maxAttempts || 3;
    const attemptNumber = progress?.attemptNumber || 1;
    const attemptsRemaining = Math.max(0, maxAttempts - attemptNumber);
    const isSequential = training.isSequential || false;
    const dueDate = progress?.dueDate ? (() => { const d = new Date(progress!.dueDate!); d.setHours(0,0,0,0); return d; })() : null;
    const todayDate = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
    const isOverdue = dueDate && dueDate < todayDate && !isCompleted;
    const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const canRetake = hasFailed && attemptsRemaining > 0;

    const handleStart = async () => {
        setStarting(true);
        try {
            await startOjtTraining(training.id);
            await loadTraining();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to start training');
        } finally {
            setStarting(false);
        }
    };

    const handleCompleteModule = async (moduleId: number) => {
        if (!progress) { await handleStart(); return; }
        setCompletingModule(moduleId);
        try {
            await completeOjtModule(training.id, moduleId);
            await loadTraining();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to mark module as done');
        } finally {
            setCompletingModule(null);
        }
    };

    const handleSubmitTest = async () => {
        const questions = training.test?.questions || [];
        const unanswered = questions.filter(q => !answers[q.id]?.trim());
        if (unanswered.length > 0) {
            Alert.alert('Incomplete', `Please answer all ${questions.length} questions before submitting.`);
            return;
        }
        setSubmitting(true);
        try {
            const result = await submitOjtTest(training.id, answers);
            setTestResult(result);
            setView('result');
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            await loadTraining();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to submit test');
        } finally {
            setSubmitting(false);
        }
    };

    // ─── RESULT VIEW ─────────────────────────────────────────────────────────
    if (view === 'result' && testResult) {
        const resAttemptsLeft = testResult.attemptsRemaining ?? attemptsRemaining;
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => { setView('modules'); setAnswers({}); }} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { flex: 1 }]}>Test Result</Text>
                </View>
                <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 72, marginBottom: 12 }}>{testResult.passed ? '🏆' : '😔'}</Text>
                    <Text style={{ fontSize: 26, fontWeight: '800', color: testResult.passed ? '#16A34A' : '#DC2626', marginBottom: 8 }}>
                        {testResult.passed ? 'Congratulations!' : 'Not Passed'}
                    </Text>
                    <Text style={{ fontSize: 16, color: '#64748B', marginBottom: 20, textAlign: 'center' }}>
                        Your Score: {testResult.score}%
                    </Text>

                    <View style={{ width: '100%', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 20, marginBottom: 20, gap: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#64748B', fontSize: 14 }}>Marks Earned</Text>
                            <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700' }}>{testResult.earned} / {testResult.totalMarks}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#64748B', fontSize: 14 }}>Passing Score</Text>
                            <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700' }}>{testResult.passingPct}%</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#64748B', fontSize: 14 }}>Attempt</Text>
                            <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700' }}>{testResult.attemptNumber ?? attemptNumber} of {testResult.maxAttempts ?? maxAttempts}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#64748B', fontSize: 14 }}>Result</Text>
                            <Text style={{ color: testResult.passed ? '#16A34A' : '#DC2626', fontSize: 14, fontWeight: '700' }}>
                                {testResult.passed ? '✓ PASSED' : '✗ FAILED'}
                            </Text>
                        </View>
                    </View>

                    {testResult.passed ? (
                        <View style={{ width: '100%', backgroundColor: '#F0FDF4', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 36 }}>🎓</Text>
                            <Text style={{ fontWeight: '700', color: '#16A34A', fontSize: 16, textAlign: 'center' }}>Certificate Pending</Text>
                            <Text style={{ color: '#4ADE80', fontSize: 13, textAlign: 'center' }}>
                                Your certificate will be granted by your admin once they review your results.
                            </Text>
                        </View>
                    ) : resAttemptsLeft > 0 ? (
                        <View style={{ width: '100%', gap: 12 }}>
                            <View style={{ backgroundColor: '#FFF7ED', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FED7AA' }}>
                                <Text style={{ fontWeight: '700', color: '#EA580C', fontSize: 15, marginBottom: 6 }}>What's Next?</Text>
                                <Text style={{ color: '#78716C', fontSize: 13, lineHeight: 20 }}>
                                    Review the module content and try again. You need {testResult.passingPct}% to pass.
                                </Text>
                                <Text style={{ color: '#D97706', fontSize: 13, fontWeight: '700', marginTop: 8 }}>
                                    {resAttemptsLeft} attempt{resAttemptsLeft !== 1 ? 's' : ''} remaining
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => { setAnswers({}); setTestResult(null); setView('test'); scrollRef.current?.scrollTo({ y: 0 }); }}
                                style={{ backgroundColor: '#7C3AED', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                            >
                                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Retake Test ({resAttemptsLeft} left)</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={{ width: '100%', backgroundColor: '#FEF2F2', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FECACA' }}>
                            <Text style={{ fontWeight: '700', color: '#DC2626', fontSize: 15, marginBottom: 6 }}>Maximum Attempts Reached</Text>
                            <Text style={{ color: '#78716C', fontSize: 13, lineHeight: 20 }}>
                                You have used all {testResult.maxAttempts ?? maxAttempts} attempts. Please speak with your supervisor.
                            </Text>
                        </View>
                    )}

                    <TouchableOpacity
                        onPress={() => { setView('modules'); setAnswers({}); setTestResult(null); }}
                        style={{ marginTop: 24, backgroundColor: '#2563EB', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' }}
                    >
                        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Back to Training</Text>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ─── TEST VIEW ────────────────────────────────────────────────────────────
    if (view === 'test') {
        const questions = training.test?.questions || [];
        const totalMarks = questions.reduce((s, q) => s + Number(q.marks || 1), 0);
        const passingMarks = Math.ceil((totalMarks * training.passingPercentage) / 100);

        return (
            <SafeAreaView style={styles.container}>
                <View style={[styles.header, { backgroundColor: '#7C3AED' }]}>
                    <TouchableOpacity onPress={() => setView('modules')} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Final Test</Text>
                        <Text style={styles.headerSub}>{questions.length} questions · Pass: {training.passingPercentage}%</Text>
                    </View>
                </View>

                <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}>
                    {/* Test Info */}
                    <View style={{ backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#DDD6FE' }}>
                        <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: 14 }}>
                            Total: {totalMarks} marks | Passing: {passingMarks} marks ({training.passingPercentage}%)
                        </Text>
                    </View>

                    {questions.map((q, i) => {
                        const opts = getOptions(q);
                        return (
                            <View key={q.id} style={styles.questionCard}>
                                <Text style={styles.questionText}>Q{i + 1}. {q.question}</Text>
                                <Text style={styles.marksText}>{q.marks} mark{Number(q.marks) !== 1 ? 's' : ''}</Text>

                                {opts.length > 0 ? (
                                    <View style={{ gap: 8, marginTop: 10 }}>
                                        {opts.map(opt => (
                                            <TouchableOpacity
                                                key={opt}
                                                onPress={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                                style={[
                                                    styles.optionBtn,
                                                    answers[q.id] === opt && styles.optionSelected,
                                                ]}
                                            >
                                                <View style={[
                                                    styles.optionDot,
                                                    answers[q.id] === opt && { backgroundColor: '#2563EB', borderColor: '#2563EB' },
                                                ]} />
                                                <Text style={[
                                                    styles.optionText,
                                                    answers[q.id] === opt && { color: '#1D4ED8', fontWeight: '600' },
                                                ]}>{opt}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                ) : (
                                    <TextInput
                                        value={answers[q.id] || ''}
                                        onChangeText={(val) => setAnswers(prev => ({ ...prev, [q.id]: val }))}
                                        placeholder="Type your answer..."
                                        placeholderTextColor="#94A3B8"
                                        multiline
                                        style={styles.textAnswer}
                                    />
                                )}
                            </View>
                        );
                    })}
                </ScrollView>

                {/* Submit Button */}
                <View style={styles.stickyBottom}>
                    <TouchableOpacity
                        onPress={handleSubmitTest}
                        disabled={submitting}
                        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.submitBtnText}>Submit Test</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ─── MODULES VIEW (DEFAULT) ───────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{training.title}</Text>
                    {training.assetName && <Text style={styles.headerSub}>Asset: {training.assetName}</Text>}
                </View>
                {isCertified && (
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>🏆 Certified</Text>
                    </View>
                )}
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
                {/* Due Date / Overdue Banner */}
                {isOverdue && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}>
                        <Ionicons name="warning-outline" size={18} color="#DC2626" />
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 13 }}>Training Overdue</Text>
                            <Text style={{ color: '#F87171', fontSize: 12, marginTop: 1 }}>Due {dueDate!.toLocaleDateString()} — please complete as soon as possible.</Text>
                        </View>
                    </View>
                )}
                {dueDate && !isOverdue && daysUntilDue !== null && daysUntilDue <= 7 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FDE68A' }}>
                        <Ionicons name="calendar-outline" size={16} color="#D97706" />
                        <Text style={{ color: '#92400E', fontWeight: '600', fontSize: 13, flex: 1 }}>
                            {daysUntilDue === 0 ? 'Due today' : daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${daysUntilDue} days`} — {dueDate.toLocaleDateString()}
                        </Text>
                    </View>
                )}

                {/* Progress Card */}
                <View style={styles.progressCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={styles.progressTitle}>Your Progress</Text>
                        <Text style={styles.progressPctText}>{progressPct}%</Text>
                    </View>
                    <Text style={styles.progressSub}>{completedCount}/{totalModules} modules completed</Text>

                    {/* Attempt counter */}
                    {progress && hasTest && maxAttempts > 1 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <MaterialCommunityIcons name="refresh" size={14} color={attemptsRemaining <= 1 && hasFailed ? '#DC2626' : '#64748B'} />
                            <Text style={{ fontSize: 12, color: attemptsRemaining <= 1 && hasFailed ? '#DC2626' : '#64748B', fontWeight: '600' }}>
                                Attempt {attemptNumber} of {maxAttempts}{hasFailed && attemptsRemaining > 0 ? ` · ${attemptsRemaining} remaining` : ''}
                            </Text>
                        </View>
                    )}

                    <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progressPct}%` as any, backgroundColor: progressPct === 100 ? '#16A34A' : '#2563EB' }]} />
                    </View>

                    {!progress && (
                        <TouchableOpacity onPress={handleStart} disabled={starting} style={styles.startBtn}>
                            {starting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.startBtnText}>▶ Start Training</Text>}
                        </TouchableOpacity>
                    )}

                    {isCertified && (
                        <View style={{ marginTop: 12, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#86EFAC' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <Text style={{ fontSize: 28 }}>🏆</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontWeight: '800', color: '#16A34A', fontSize: 15 }}>Certificate of Completion</Text>
                                    <Text style={{ color: '#4ADE80', fontSize: 12, marginTop: 1 }}>Successfully completed this training</Text>
                                </View>
                            </View>
                            <View style={{ backgroundColor: '#DCFCE7', borderRadius: 8, padding: 10 }}>
                                <Text style={{ color: '#166534', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{training.title}</Text>
                                {progress?.score != null && <Text style={{ color: '#16A34A', fontSize: 12, textAlign: 'center', marginTop: 2 }}>Final Score: {progress.score}%</Text>}
                                {progress?.completedAt && <Text style={{ color: '#4ADE80', fontSize: 11, textAlign: 'center', marginTop: 2 }}>Completed: {new Date(progress.completedAt).toLocaleDateString()}</Text>}
                            </View>
                        </View>
                    )}

                    {isCompleted && !isCertified && (
                        <View style={{ marginTop: 12, gap: 8 }}>
                            <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#BFDBFE' }}>
                                <Text style={{ fontWeight: '700', color: '#2563EB', fontSize: 13 }}>
                                    ✓ Test Passed — Score: {progress?.score}%
                                </Text>
                                <Text style={{ color: '#60A5FA', fontSize: 12, marginTop: 3 }}>
                                    Certificate will be issued by your admin.
                                </Text>
                            </View>
                            {progress?.trainerSignOffAt ? (
                                <View style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MaterialCommunityIcons name="check-decagram" size={18} color="#16A34A" />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: '700', color: '#16A34A', fontSize: 12 }}>Trainer Sign-off Complete</Text>
                                        <Text style={{ color: '#4ADE80', fontSize: 11, marginTop: 1 }}>{new Date(progress.trainerSignOffAt).toLocaleDateString()}</Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={{ backgroundColor: '#FFF7ED', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FED7AA', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MaterialCommunityIcons name="clock-outline" size={18} color="#D97706" />
                                    <Text style={{ color: '#92400E', fontSize: 12, flex: 1, fontWeight: '600' }}>Awaiting trainer practical sign-off</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {hasFailed && (
                        <View style={{ marginTop: 12, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}>
                            <Text style={{ fontWeight: '700', color: '#DC2626', fontSize: 13 }}>
                                Test Result: {progress?.score}% — Not Passed
                            </Text>
                            <Text style={{ color: '#F87171', fontSize: 12, marginTop: 3 }}>
                                {canRetake
                                    ? `Review the modules and retake the test. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining.`
                                    : 'Maximum attempts reached. Please speak with your supervisor.'}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Modules */}
                <Text style={styles.sectionTitle}>📚 Training Modules</Text>
                {training.modules.map((m, idx) => {
                    const isDone = completedModuleIds.includes(m.id);
                    const isExpanded = expandedModule === m.id;
                    const prevDone = idx === 0 || completedModuleIds.includes(training.modules[idx - 1].id);
                    const isLocked = (isSequential && !prevDone && !isDone) || (!progress && idx > 0);

                    return (
                        <View key={m.id} style={[styles.moduleCard, isDone && { borderColor: '#BBF7D0', borderWidth: 1.5 }]}>
                            {/* Module Header */}
                            <TouchableOpacity
                                style={styles.moduleHeader}
                                onPress={() => {
                                    if (isLocked) {
                                        Alert.alert('Module Locked', isSequential ? 'Complete the previous module first.' : 'Start the training to unlock this module.');
                                        return;
                                    }
                                    setExpandedModule(isExpanded ? null : m.id);
                                }}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.moduleNum, { backgroundColor: isDone ? '#DCFCE7' : isLocked ? '#F1F5F9' : '#EFF6FF' }]}>
                                    {isLocked ? (
                                        <MaterialCommunityIcons name="lock-outline" size={16} color="#94A3B8" />
                                    ) : isDone ? (
                                        <MaterialCommunityIcons name="check" size={16} color="#16A34A" />
                                    ) : (
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>{idx + 1}</Text>
                                    )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.moduleTitle}>{m.title}</Text>
                                    <Text style={styles.moduleSub}>{m.contents.length} content item{m.contents.length !== 1 ? 's' : ''}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    {isDone && (
                                        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                            <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: '700' }}>Done</Text>
                                        </View>
                                    )}
                                    <MaterialCommunityIcons
                                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                        size={20}
                                        color="#94A3B8"
                                    />
                                </View>
                            </TouchableOpacity>

                            {/* Module Content */}
                            {isExpanded && (
                                <View style={styles.moduleBody}>
                                    {m.description ? (
                                        <Text style={styles.moduleDesc}>{m.description}</Text>
                                    ) : null}

                                    {m.contents.length > 0 && (
                                        <View style={{ gap: 8, marginBottom: 14 }}>
                                            {m.contents.map(c => (
                                                <View key={c.id} style={styles.contentItem}>
                                                    <ContentIcon type={c.type} />
                                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                                        <Text style={styles.contentType}>{c.type.toUpperCase()}</Text>
                                                        <Text style={styles.contentDesc}>{c.description || 'No description'}</Text>
                                                        {c.url && c.type === 'video' && (() => {
                                                            // External URL (http/https) → EmbeddedVideoPlayer handles YouTube/Vimeo/etc
                                                            // Local path (e.g. /uploads/...) → native VideoPlayer
                                                            if (c.url.startsWith('http')) {
                                                                return (
                                                                    <EmbeddedVideoPlayer
                                                                        url={c.url}
                                                                        onComplete={() => {
                                                                            if (!isDone && progress) handleCompleteModule(m.id);
                                                                        }}
                                                                    />
                                                                );
                                                            }
                                                            // Local file served by backend
                                                            const fullUrl = `${API_BASE}${c.url}`;
                                                            return (
                                                                <VideoPlayer
                                                                    uri={fullUrl}
                                                                    onComplete={() => {
                                                                        if (!isDone && progress) handleCompleteModule(m.id);
                                                                    }}
                                                                />
                                                            );
                                                        })()}
                                                        {c.url && c.type !== 'video' && (
                                                            <TouchableOpacity
                                                                onPress={() => {
                                                                    const fullUrl = c.url!.startsWith('http') ? c.url! : `${API_BASE}${c.url!}`;
                                                                    WebBrowser.openBrowserAsync(fullUrl);
                                                                }}
                                                                style={{ marginTop: 4 }}
                                                            >
                                                                <Text style={styles.contentLink}>Open Document →</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    {m.contents.length === 0 && (
                                        <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 14 }}>No content for this module yet.</Text>
                                    )}

                                    {/* Mark Done Button */}
                                    {!isDone && progress && (
                                        <TouchableOpacity
                                            onPress={() => handleCompleteModule(m.id)}
                                            disabled={completingModule === m.id}
                                            style={[styles.markDoneBtn, completingModule === m.id && { opacity: 0.6 }]}
                                        >
                                            {completingModule === m.id ? (
                                                <ActivityIndicator color="#FFFFFF" size="small" />
                                            ) : (
                                                <Text style={styles.markDoneText}>✓ Mark as Done</Text>
                                            )}
                                        </TouchableOpacity>
                                    )}

                                    {!progress && (
                                        <TouchableOpacity onPress={handleStart} disabled={starting} style={[styles.markDoneBtn, { backgroundColor: '#7C3AED' }]}>
                                            <Text style={styles.markDoneText}>{starting ? 'Starting...' : '▶ Start Training to Track Progress'}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                    );
                })}

                {/* Take Test Button */}
                {hasTest && allModulesDone && !isCompleted && (!hasFailed || canRetake) && (
                    <TouchableOpacity
                        onPress={() => { setAnswers({}); setView('test'); scrollRef.current?.scrollTo({ y: 0 }); }}
                        style={styles.testBtn}
                        activeOpacity={0.85}
                    >
                        <MaterialCommunityIcons name="pencil-circle-outline" size={22} color="#FFFFFF" />
                        <Text style={styles.testBtnText}>
                            {hasFailed ? `Retake Test (${attemptsRemaining} left)` : 'Take Final Test'}
                        </Text>
                    </TouchableOpacity>
                )}

                {hasTest && allModulesDone && hasFailed && !canRetake && (
                    <View style={[styles.testLockedCard, { borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
                        <MaterialCommunityIcons name="close-circle-outline" size={18} color="#DC2626" />
                        <Text style={[styles.testLockedText, { color: '#DC2626' }]}>
                            Maximum attempts reached ({maxAttempts}/{maxAttempts}). Please contact your supervisor.
                        </Text>
                    </View>
                )}

                {hasTest && !allModulesDone && progress && (
                    <View style={styles.testLockedCard}>
                        <MaterialCommunityIcons name="lock-outline" size={18} color="#94A3B8" />
                        <Text style={styles.testLockedText}>
                            Complete all {totalModules} modules to unlock the test
                        </Text>
                    </View>
                )}

                {!hasTest && allModulesDone && !isCompleted && progress && (
                    <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center' }}>
                        <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 15 }}>🎉 All Modules Completed!</Text>
                        <Text style={{ color: '#4ADE80', fontSize: 13, marginTop: 4 }}>No test required. Awaiting certificate from admin.</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// dummy – used in result view to clear result state without breaking flow
function replaceTestResult() { /* handled via setTestResult in parent */ }

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        backgroundColor: '#2563EB',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 12 : 8,
        paddingBottom: 16,
        gap: 12,
    },
    backBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
    headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: '#64748B', marginTop: 12, fontSize: 14 },
    progressCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    progressTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
    progressPctText: { fontSize: 18, fontWeight: '800', color: '#2563EB' },
    progressSub: { fontSize: 13, color: '#64748B', marginBottom: 8 },
    progressTrack: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
    progressFill: { height: '100%', borderRadius: 4 },
    startBtn: {
        marginTop: 14, backgroundColor: '#2563EB', paddingVertical: 12,
        borderRadius: 10, alignItems: 'center',
    },
    startBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
    moduleCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    moduleHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    moduleNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    moduleTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    moduleSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
    moduleBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    moduleDesc: { fontSize: 13, color: '#475569', lineHeight: 18, marginTop: 10, marginBottom: 10 },
    contentItem: {
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    contentType: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5 },
    contentDesc: { fontSize: 13, color: '#334155', marginTop: 2 },
    contentLink: { fontSize: 12, color: '#2563EB', fontWeight: '600', marginTop: 4 },
    markDoneBtn: {
        backgroundColor: '#16A34A', paddingVertical: 11, borderRadius: 10,
        alignItems: 'center', marginTop: 4,
    },
    markDoneText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    testBtn: {
        backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 14,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    testBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    testLockedCard: {
        backgroundColor: '#F1F5F9', borderRadius: 12, padding: 16,
        flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    testLockedText: { fontSize: 13, color: '#94A3B8', flex: 1 },
    // Test view
    questionCard: {
        backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16,
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
    },
    questionText: { fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 20, marginBottom: 4 },
    marksText: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 4 },
    optionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
    },
    optionSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    optionDot: {
        width: 18, height: 18, borderRadius: 9,
        borderWidth: 2, borderColor: '#CBD5E1',
    },
    optionText: { fontSize: 13, color: '#334155', flex: 1 },
    textAnswer: {
        marginTop: 10, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10,
        padding: 12, fontSize: 14, color: '#0F172A', minHeight: 80,
        textAlignVertical: 'top', backgroundColor: '#F8FAFC',
    },
    stickyBottom: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#FFFFFF', padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 28 : 16,
        borderTopWidth: 1, borderTopColor: '#E2E8F0',
    },
    submitBtn: {
        backgroundColor: '#7C3AED', paddingVertical: 15, borderRadius: 12,
        alignItems: 'center',
    },
    submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
