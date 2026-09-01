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
  /** Can raise an Additional Request from the mobile home screen */
  canRaiseAdditionalRequest: boolean;
  /** Can mark attendance for company employees (non-admin executive capability) */
  canMarkAttendance: boolean;
  /** Can assign/reassign raised requests and change their status/cutoff (non-admin executive capability) */
  canAssignRaisedRequests: boolean;
  /** Can fill / execute logsheets */
  canFillLogsheet?: boolean;
  /** Can assign logsheets to team */
  canAssignLogsheet?: boolean;
  /** Can fill / execute checklists */
  canFillChecklists?: boolean;
  /** Can assign checklists to team */
  canAssignChecklists?: boolean;
  /** Can execute work orders */
  canExecuteWorkOrders?: boolean;
  /** Can assign work orders */
  canAssignWorkOrders?: boolean;
  /** Can assign HK requests on mobile */
  canAssignHKRequestMobile?: boolean;
  /** Can change status of HK requests on mobile */
  canChangeStatusHKRequestMobile?: boolean;
  /** Can assign warnings on mobile */
  canAssignWarningsMobile?: boolean;
  /** Can change status of warnings on mobile */
  canChangeStatusWarningsMobile?: boolean;
  /**
   * Client-side supervisor: can only raise soft-service requests.
   * Computed server-side: canRaiseSoftIssue && !canResolveSoftIssue && !isSoftManager && !isTechnicalSupervisor && !isTechnician
   */
  isClientSupervisor: boolean;
}

export const EMPTY_CAPS: RoleCapabilities = {
  canRaiseSoftIssue:              false,
  canResolveSoftIssue:            false,
  isSoftManager:                  false,
  isTechnicalSupervisor:          false,
  isTechnician:                   false,
  isClientSupervisor:             false,
  canRaiseAdditionalRequest:      false,
  canMarkAttendance:              false,
  canAssignRaisedRequests:        false,
  canFillLogsheet:                false,
  canAssignLogsheet:              false,
  canFillChecklists:              false,
  canAssignChecklists:            false,
  canExecuteWorkOrders:           false,
  canAssignWorkOrders:            false,
  canAssignHKRequestMobile:       false,
  canChangeStatusHKRequestMobile: false,
  canAssignWarningsMobile:        false,
  canChangeStatusWarningsMobile:  false,
};

// ─── Capability queries ───────────────────────────────────────────────────────

/** Any kind of technical access (manage OR execute) */
export const hasTechAccess = (c?: RoleCapabilities | null) =>
  !!(c?.isTechnicalSupervisor || c?.isTechnician || c?.canFillChecklists || c?.canAssignChecklists || c?.canFillLogsheet || c?.canAssignLogsheet || c?.canExecuteWorkOrders || c?.canAssignWorkOrders);

/** Any kind of soft-service access */
export const hasSoftAccess = (c?: RoleCapabilities | null) =>
  !!(c?.canRaiseSoftIssue || c?.canResolveSoftIssue || c?.isSoftManager);

/** Can see and manage assigned checklists */
export const canViewChecklists = (c?: RoleCapabilities | null) =>
  !!(c?.canFillChecklists || c?.canAssignChecklists || (c?.canFillChecklists === undefined && (c?.isTechnicalSupervisor || c?.isTechnician)));

/** Can fill logsheets */
export const canFillLogsheet = (c?: RoleCapabilities | null) =>
  !!(c?.canFillLogsheet !== undefined ? c.canFillLogsheet : (c?.isTechnician || c?.isTechnicalSupervisor));

/** Can assign logsheets */
export const canAssignLogsheet = (c?: RoleCapabilities | null) =>
  !!(c?.canAssignLogsheet !== undefined ? c.canAssignLogsheet : c?.isTechnicalSupervisor);

/** Can fill checklists */
export const canFillChecklists = (c?: RoleCapabilities | null) =>
  !!(c?.canFillChecklists !== undefined ? c.canFillChecklists : (c?.isTechnician || c?.isTechnicalSupervisor));

/** Can assign checklists */
export const canAssignChecklists = (c?: RoleCapabilities | null) =>
  !!(c?.canAssignChecklists !== undefined ? c.canAssignChecklists : c?.isTechnicalSupervisor);

/** Can see team assignments panel */
export const canManageTeam = (c?: RoleCapabilities | null) =>
  !!(c?.canAssignChecklists || c?.canAssignLogsheet || c?.canAssignWorkOrders || (c?.canAssignChecklists === undefined && c?.isTechnicalSupervisor));

/** Can create or update work orders */
export const canManageWorkOrders = (c?: RoleCapabilities | null) =>
  !!(c?.canAssignWorkOrders !== undefined ? c.canAssignWorkOrders : c?.isTechnicalSupervisor);

/** Can execute / respond to assigned work orders */
export const canExecuteWorkOrders = (c?: RoleCapabilities | null) =>
  !!(c?.canExecuteWorkOrders !== undefined ? c.canExecuteWorkOrders : (c?.isTechnician || c?.isTechnicalSupervisor));

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
  !!(c?.isTechnicalSupervisor || c?.isTechnician || hasTechAccess(c));

/** Access to asset list */
export const canViewAssets = (_c?: RoleCapabilities | null) => true; // all roles

/** Access to warnings */
export const canViewWarnings = (c?: RoleCapabilities | null) =>
  !!(c?.isTechnicalSupervisor || c?.isTechnician || hasTechAccess(c));

/** Access to notifications — all authenticated company users can receive notifications */
export const canViewNotifications = (_c?: RoleCapabilities | null) =>
  true;

/** Can mark attendance for employees (admin or granted via role) */
export const canMarkAttd = (c?: RoleCapabilities | null) =>
  !!c?.canMarkAttendance;

/** Can assign/manage raised requests (admin or granted via role) */
export const canAssignReqs = (c?: RoleCapabilities | null) =>
  !!c?.canAssignRaisedRequests;

/** Can assign HK requests on mobile */
export const canAssignHK = (c?: RoleCapabilities | null) =>
  !!(c?.canAssignHKRequestMobile !== undefined ? c.canAssignHKRequestMobile : (c?.isSoftManager || c?.canAssignRaisedRequests));

/** Can change status of HK requests on mobile */
export const canChangeHKStatus = (c?: RoleCapabilities | null) =>
  !!(c?.canChangeStatusHKRequestMobile !== undefined ? c.canChangeStatusHKRequestMobile : (c?.canResolveSoftIssue || c?.isSoftManager || c?.canAssignRaisedRequests));

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
    { key: 'dashboard', label: 'Dashboard', icon: 'chart-donut', route: '/(tabs)/dashboard' },
  ];

  if (canManageTeam(c)) {
    tabs.push({ key: 'assignments', label: 'Team', icon: 'account-group', route: '/(tabs)/assignments' });
  }
  if (
    hasSoftAccess(c) ||
    c?.canAssignRaisedRequests ||
    c?.canExecuteWorkOrders ||
    c?.canAssignWorkOrders ||
    c?.isTechnicalSupervisor ||
    c?.isTechnician
  ) {
    tabs.push({ key: 'soft', label: 'Requests', icon: 'wrench', route: '/(tabs)/soft-requests' });
  }

  tabs.push({ key: 'profile', label: 'Profile', icon: 'account-circle', route: '/(tabs)/profile' });
  return tabs;
}
