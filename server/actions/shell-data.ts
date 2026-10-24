"use server";
import { getCurrentUser, type CurrentUser } from "./auth";
import { getStudentJoinedGroups } from "./advisory-groups";
import { getMyNotifications } from "./approval-workflow";

export type StudentShell =
  | {
      success: true;
      user: CurrentUser;
      hasGroup: boolean;
      groupCount: number;
      unreadCount: number;
    }
  | { success: false; error: string };

export async function getStudentShell(): Promise<StudentShell> {
  const [user, groups, notifications] = await Promise.all([
    getCurrentUser(),
    getStudentJoinedGroups(),
    getMyNotifications(),
  ]);

  if (!user) return { success: false, error: "You must be logged in." };

  const groupCount = groups.success ? groups.data.length : 0;
  const unreadCount = notifications.success
    ? notifications.data.filter((n) => !n.readAt).length
    : 0;

  return { success: true, user, hasGroup: groupCount > 0, groupCount, unreadCount };
}