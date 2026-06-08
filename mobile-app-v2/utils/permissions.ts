/**
 * Permission helpers — ALL capability checks go through this file.
 * Zero hardcoded role strings. All access is determined solely by
 * the RoleCapabilities flags returned from the API.
 *
 * The admin configures which capabilities each role has in the
 * Company Portal → Roles settings. The mobile app reads and respects
 * those flags without any knowledge of the role label or key.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoleCapabilities {
  /** Can submit a new soft-service / issue request */
  canRaiseSoftIssue: boolean;
  /** Can view and resolve soft-service requests raised by others */
  canResolveSoftIssue: boolean;
  /** Manages the soft-service function (sees all requests, team stats) */
  isSoftManager: boolean;
  /** Technical supervisor: manages team, assigns checklists & work orders */
  isTechnicalSupervisor: boolean;
  /** Technician: executes assigned checklists & work orders */
  isTechnician: boolean;
}

export const EMPTY_CAPS: RoleCapabilities = {
  canRaiseSoftIssue:      false,
  canResolveSoftIssue:    false,
  isSoftManager:          false,
  isTechnicalSupervisor:  false,
  isTechnician:           false,
};

// ─── Capability queries ───────────────────────────────────────────────────────

/** Any kind of technical access (manage OR execute) */
export const hasTechAccess = (c?: RoleCapabilities | null) =>
  !!(c?.isTechnicalSupervisor || c?.isTechnician);

/** Any kind of soft-service access */
export const hasSoftAccess = (c?: RoleCapabilities | null) =>
  !!(c?.canRaiseSoftIssue || c?.canResolveSoftIssue || c?.isSoftManager);

/** Can see and manage assigned checklists */
export const canViewChecklists = (c?: RoleCapabilities | null) =>
  !!(c?.isTechnicalSupervisor || c?.isTechnician);

/** Can see team assignments panel */
export const canManageTeam = (c?: RoleCapabilities | null) =>
  !!c?.isTechnicalSupervisor;

/** Can create or update work orders */
export const canManageWorkOrders = (c?: RoleCapabilities | null) =>
  !!c?.isTechnicalSupervisor;

/** Can execute / respond to assigned work orders */
export const canExecuteWorkOrders = (c?: RoleCapabilities | null) =>
  !!(c?.isTechnicalSupervisor || c?.isTechnician);

/** Can raise a soft-service request */
export const canRaiseSoft = (c?: RoleCapabilities | null) =>
  !!c?.canRaiseSoftIssue;

/** Can resolve soft-service requests */
export const canResolveSoft = (c?: RoleCapabilities | null) =>
  !!(c?.canResolveSoftIssue || c?.isSoftManager);

/** Sees the full soft-service management view */
export const isSoftManager = (c?: RoleCapabilities | null) =>
  !!c?.isSoftManager;

/** Access to OJT training module */
export const canViewTraining = (c?: RoleCapabilities | null) =>
  !!(c?.isTechnicalSupervisor || c?.isTechnician);

/** Access to asset list */
export const canViewAssets = (c?: RoleCapabilities | null) => true; // all roles

/** Access to warnings */
export const canViewWarnings = (c?: RoleCapabilities | null) =>
  !!(c?.isTechnicalSupervisor || c?.isTechnician);

/** Access to notifications — all authenticated company users can receive notifications */
export const canViewNotifications = (_c?: RoleCapabilities | null) =>
  true;

// ─── Home screen routing ─────────────────────────────────────────────────────
/**
 * Returns the home tab destination based on capabilities.
 * Used after login to route the user to the right dashboard.
 */
export function resolveHomeRoute(c?: RoleCapabilities | null): string {
  if (!c) return '/(tabs)/home';
  if (c.isTechnicalSupervisor) return '/(tabs)/home';
  if (c.isTechnician)          return '/(tabs)/home';
  if (c.isSoftManager)         return '/(tabs)/home';
  if (c.canResolveSoftIssue)   return '/(tabs)/home';
  if (c.canRaiseSoftIssue)     return '/(tabs)/home';
  return '/(tabs)/home';
}

// ─── Tab bar config ───────────────────────────────────────────────────────────
export interface TabConfig {
  key:   string;
  label: string;
  icon:  string;
  route: string;
}

export function buildTabs(c?: RoleCapabilities | null): TabConfig[] {
  const tabs: TabConfig[] = [
    { key: 'home', label: 'Home', icon: 'home-variant', route: '/(tabs)/home' },
  ];

  if (hasTechAccess(c)) {
    tabs.push({ key: 'checklists', label: 'Checklists', icon: 'clipboard-check', route: '/(tabs)/checklists' });
  }
  if (canManageTeam(c)) {
    tabs.push({ key: 'assignments', label: 'Team', icon: 'account-group', route: '/(tabs)/assignments' });
  }
  if (hasSoftAccess(c)) {
    tabs.push({ key: 'soft', label: 'Requests', icon: 'wrench', route: '/(tabs)/soft-requests' });
  }

  tabs.push({ key: 'profile', label: 'Profile', icon: 'account-circle', route: '/(tabs)/profile' });
  return tabs;
}
