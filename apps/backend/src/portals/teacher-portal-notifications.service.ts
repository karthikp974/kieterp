import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FeedbackFormStatus, PermissionAction, UserType } from "@prisma/client";
import { AnnouncementsService } from "../announcements/announcements.service";
import { AuthUser } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { PortalNotificationsQueryDto } from "./portal-notifications.dto";
import {
  getActiveTeacherProfile,
  loadTeacherAssignedSections,
  resolveTeacherEngageContext,
  sectionScopedWhere
} from "./teacher-portal-section-scope.util";

export type TeacherPortalNotificationFeedItem = {
  id: string;
  kind: "ANNOUNCEMENT" | "FEEDBACK" | "SYSTEM";
  title: string;
  bodyPreview: string;
  createdAt: string;
  readAt: string | null;
  href: string;
  priority?: string | null;
  pinned?: boolean;
  announcementId?: string;
  feedbackFormId?: string;
};

@Injectable()
export class TeacherPortalNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly announcements: AnnouncementsService,
    private readonly permissions: PermissionsService
  ) {}

  async unreadCount(user: AuthUser) {
    if (user.type !== UserType.TEACHER) {
      return { unreadCount: 0, announcements: 0, feedbackPending: 0 };
    }

    const [announcements, feedbackPending] = await Promise.all([
      this.announcements.countUnreadForTeacher(user),
      this.countActiveFeedbackForms(user)
    ]);

    return {
      unreadCount: announcements + feedbackPending,
      announcements,
      feedbackPending
    };
  }

  async listFeed(user: AuthUser, query: PortalNotificationsQueryDto) {
    this.assertTeacher(user);
    const pagination = toPagination(query);
    const items = await this.buildFeedItems(user, query.search);
    let filtered = items;
    if (query.kind) filtered = filtered.filter((i) => i.kind === query.kind);
    if (query.unreadOnly === true) filtered = filtered.filter((i) => !i.readAt);
    if (query.search?.trim()) {
      const s = query.search.trim().toLowerCase();
      filtered = filtered.filter(
        (i) => i.title.toLowerCase().includes(s) || i.bodyPreview.toLowerCase().includes(s)
      );
    }
    const total = filtered.length;
    const pageItems = filtered.slice(pagination.skip, pagination.skip + pagination.take);
    return {
      items: pageItems,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      unreadCount: items.filter((i) => !i.readAt).length
    };
  }

  async markNotificationRead(user: AuthUser, feedItemId: string) {
    this.assertTeacher(user);
    if (feedItemId.startsWith("announcement:")) {
      const announcementId = feedItemId.slice("announcement:".length);
      await this.announcements.markRead(user, announcementId);
      return { ok: true };
    }
    if (feedItemId.startsWith("feedback-active:")) {
      return { ok: true };
    }
    throw new NotFoundException("Notification not found.");
  }

  async markAllRead(user: AuthUser) {
    this.assertTeacher(user);
    let marked = 0;
    if (this.permissions.can(user, { action: PermissionAction.VIEW_ANNOUNCEMENTS }).allowed) {
      const result = await this.announcements.markAllTeacherInboxRead(user);
      marked += result.marked ?? 0;
    }
    return { ok: true, marked };
  }

  notificationsVersion(userId: string) {
    return { userId, version: Date.now() };
  }

  private async buildFeedItems(user: AuthUser, search?: string): Promise<TeacherPortalNotificationFeedItem[]> {
    const items: TeacherPortalNotificationFeedItem[] = [];

    if (this.permissions.can(user, { action: PermissionAction.VIEW_ANNOUNCEMENTS }).allowed) {
      const rows = await this.announcements.listTeacherInbox(user, search);
      for (const row of rows) {
        const readAt = row.reads?.[0]?.readAt ?? null;
        const createdAt = row.publishedAt ?? row.createdAt;
        items.push({
          id: `announcement:${row.id}`,
          kind: "ANNOUNCEMENT",
          title: row.title,
          bodyPreview: row.body.length > 160 ? `${row.body.slice(0, 160)}…` : row.body,
          createdAt: createdAt.toISOString(),
          readAt: readAt?.toISOString() ?? null,
          href: `/teacher/announcements?open=${row.id}`,
          priority: row.priority,
          pinned: row.pinned,
          announcementId: row.id
        });
      }
    }

    if (
      this.permissions.can(user, { action: PermissionAction.VIEW_FEEDBACK_ANALYTICS }).allowed ||
      this.permissions.can(user, { action: PermissionAction.MANAGE_FEEDBACK }).allowed
    ) {
      const forms = await this.loadActiveFeedbackForms(user, search);
      const now = new Date();
      for (const form of forms) {
        items.push({
          id: `feedback-active:${form.id}`,
          kind: "FEEDBACK",
          title: `Active feedback: ${form.title}`,
          bodyPreview: form.description.length > 160 ? `${form.description.slice(0, 160)}…` : form.description,
          createdAt: form.startsAt.toISOString(),
          readAt: null,
          href: `/teacher/feedback/active-forms`,
          feedbackFormId: form.id
        });
      }
    }

    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private async countActiveFeedbackForms(user: AuthUser) {
    const forms = await this.loadActiveFeedbackForms(user);
    return forms.length;
  }

  private async loadActiveFeedbackForms(user: AuthUser, search?: string) {
    const canManage = this.permissions.can(user, { action: PermissionAction.MANAGE_FEEDBACK }).allowed;
    const canView = this.permissions.can(user, { action: PermissionAction.VIEW_FEEDBACK_ANALYTICS }).allowed;
    if (!canManage && !canView) return [];

    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const permissionAction = canManage ? PermissionAction.MANAGE_FEEDBACK : PermissionAction.VIEW_FEEDBACK_ANALYTICS;
    const sections = await loadTeacherAssignedSections(this.prisma, this.permissions, user, teacher, permissionAction);
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections);
    if (!ctx.sectionIds.length) return [];

    const now = new Date();
    const parts = [
      sectionScopedWhere(ctx.sectionIds),
      { status: FeedbackFormStatus.ACTIVE },
      { startsAt: { lte: now } },
      { endsAt: { gte: now } }
    ];
    if (search?.trim()) {
      const s = search.trim();
      parts.push({
        OR: [{ title: { contains: s, mode: "insensitive" } }, { description: { contains: s, mode: "insensitive" } }]
      });
    }

    return this.prisma.feedbackForm.findMany({
      where: { AND: parts },
      orderBy: { endsAt: "asc" },
      take: 40,
      select: { id: true, title: true, description: true, startsAt: true }
    });
  }

  private assertTeacher(user: AuthUser) {
    if (user.type !== UserType.TEACHER) {
      throw new ForbiddenException("Only teacher accounts can access portal notifications.");
    }
  }
}
