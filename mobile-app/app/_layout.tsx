import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="employee-login" options={{ headerShown: false }} />
        <Stack.Screen name="dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="assets-list" options={{ headerShown: false }} />
        <Stack.Screen name="asset-details" options={{ headerShown: false }} />
        <Stack.Screen name="warnings" options={{ headerShown: false }} />
        <Stack.Screen name="warning-details" options={{ headerShown: false }} />
        <Stack.Screen name="checklists" options={{ headerShown: false }} />
        <Stack.Screen name="checklist-details" options={{ headerShown: false }} />
        <Stack.Screen name="checklist-history" options={{ headerShown: false }} />
        <Stack.Screen name="assignments" options={{ headerShown: false }} />
        <Stack.Screen name="assignment-form" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />

        {/* Supervisor Flow */}
        <Stack.Screen name="supervisor-dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="team-assignments" options={{ headerShown: false }} />
        <Stack.Screen name="work-order-details" options={{ headerShown: false }} />

        {/* Technician Flow */}
        <Stack.Screen name="tech-dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="tech-tasks" options={{ headerShown: false }} />
        <Stack.Screen name="tech-execution" options={{ headerShown: false }} />
        <Stack.Screen name="tech-training" options={{ headerShown: false }} />
        <Stack.Screen name="tech-work-orders" options={{ headerShown: false }} />

        {/* Logsheet entry view (tabular grid history) */}
        <Stack.Screen name="logsheet-entry-view" options={{ headerShown: false }} />
        {/* Checklist entry view (monthly grid history) */}
        <Stack.Screen name="checklist-entry-view" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
