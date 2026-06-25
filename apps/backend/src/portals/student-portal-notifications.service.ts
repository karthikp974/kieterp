import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AnnouncementAudience,
  AnnouncementStatus,
  FeedbackFormStatus,
  Prisma,
  StudentPortalNotificationKind,
  UserType
} from "@prisma/client";
import { AnnouncementsService } from "../announcements/announcements.service";
import { AuthUser } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { PrismaService } from "../prisma/prisma.service";
import { campusIdsForSharedMatching, studentProfileToScope } from "../permissions/operational-scope.util";
import { loadStudentPortalProfile, type StudentPortalLoadedStudent } from "./student-portal-load-student";
import { PortalNotificationsQueryDto } from "./portal-notifications.dto";

export type StudentPortalNotificationFeedItem = {
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
  portalNotificationId?: string;
};

@Injectable()
export class StudentPortalNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly announcements: AnnouncementsService
  ) {}

  async unreadCount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, type: true }
    });
    if (!user || user.type !== UserType.STUDENT) return 0;

    const authUser = { id: user.id, type: UserType.STUDENT } as AuthUser;
    const [portalUnread, announcementUnread, pendingFeedback] = await Promise.all([
      this.prisma.studentPortalNotification.count({ where: { userId, readAt: null } }),
      this.announcements.countUnreadForStudent(authUser),
      this.countPendingFeedbackForms(userId)
    ]);
    return portalUnread + announcementUnread + pendingFeedback;
  }

  async listFeed(user: AuthUser, query: PortalNotificationsQueryDto) {
    this.assertStudent(user);
    const pagination = toPagination(query);
    const items = await this.buildFeedItems(user.id, query.search);
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
    this.assertStudent(user);
    if (feedItemId.startsWith("announcement:")) {
      const announcementId = feedItemId.slice("announcement:".length);
      await this.announcements.markRead(user, announcementId);
      return { ok: true };
    }
    if (feedItemId.startsWith("portal:")) {
      return this.markPortalNotificationRead(user, feedItemId.slice("portal:".length));
    }
    if (feedItemId.startsWith("feedback-pending:")) {
      return { ok: true };
    }
    throw new NotFoundException("Notification not found.");
  }

  async markAllRead(user: AuthUser) {
    this.assertStudent(user);
    let marked = 0;
    const now = new Date();

    const [portalRows, items] = await Promise.all([
      this.prisma.studentPortalNotification.findMany({ where: { userId: user.id, readAt: null } }),
      this.buildFeedItems(user.id)
    ]);

    if (portalRows.length) {
      await this.prisma.studentPortalNotification.updateMany({
        where: { userId: user.id, readAt: null },
        data: { readAt: now }
      });
      marked += portalRows.length;
    }

    const unreadAnnouncements = items.filter((i) => i.kind === "ANNOUNCEMENT" && !i.readAt && i.announcementId);
    if (unreadAnnouncements.length) {
      await this.prisma.$transaction(
        unreadAnnouncements.map((item) =>
          this.prisma.announcementRead.upsert({
            where: {
              announcementId_userId: { announcementId: item.announcementId!, userId: user.id }
            },
            create: { announcementId: item.announcementId!, userId: user.id, readAt: now },
            update: { readAt: now }
          })
        )
      );
      marked += unreadAnnouncements.length;
    }

    return { ok: true, marked };
  }

  async markPortalNotificationRead(user: AuthUser, notificationId: string) {
    this.assertStudent(user);
    const row = await this.prisma.studentPortalNotification.findFirst({
      where: { id: notificationId, userId: user.id }
    });
    if (!row) throw new NotFoundException("Notification not found.");
    await this.prisma.studentPortalNotification.update({
      where: { id: notificationId },
      data: { readAt: row.readAt ?? new Date() }
    });
    return { ok: true };
  }

  /** Reserved for future WebSocket / SSE push — callers can invalidate client badge after mutations. */
  notificationsVersion(userId: string) {
    return { userId, version: Date.now() };
  }

  private async buildFeedItems(userId: string, search?: string): Promise<StudentPortalNotificationFeedItem[]> {
    let student: StudentPortalLoadedStudent;
    try {
      student = await loadStudentPortalProfile(this.prisma, userId);
    } catch {
      return [];
    }

    const now = new Date();
    const expiry: Prisma.AnnouncementWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const scope = studentProfileToScope(student);
    const campusIds = campusIdsForSharedMatching(student);
    const structural: Prisma.AnnouncementWhereInput[] = [
      { OR: [{ campusId: null }, { campusId: { in: campusIds } }] },
      { OR: [{ programId: null }, { programId: scope.programId }] },
      { OR: [{ branchId: null }, { branchId: scope.branchId }] },
      { OR: scope.batchId ? [{ batchId: null }, { batchId: scope.batchId }] : [{ batchId: null }] },
      { OR: [{ classId: null }, { classId: scope.classId }] },
      { OR: [{ sectionId: null }, { sectionId: scope.sectionId }] }
    ];

    const searchPart: Prisma.AnnouncementWhereInput[] = [];
    if (search?.trim()) {
      const s = search.trim();
      searchPart.push({
        OR: [{ title: { contains: s, mode: "insensitive" } }, { body: { contains: s, mode: "insensitive" } }]
      });
    }

    const [announcementRows, portalRows, feedbackForms, reads, submissions] = await Promise.all([
      this.prisma.announcement.findMany({
        where: {
          AND: [
            expiry,
            { status: AnnouncementStatus.PUBLISHED },
            { audience: { in: [AnnouncementAudience.STUDENTS, AnnouncementAudience.BOTH, AnnouncementAudience.ALL] } },
            ...structural,
            ...searchPart
          ]
        },
        include: {
          createdBy: { select: { fullName: true } },
          reads: { where: { userId }, take: 1, select: { readAt: true } }
        },
        orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        take: 80
      }),
      this.prisma.studentPortalNotification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 40
      }),
      this.prisma.feedbackForm.findMany({
        where: this.buildStudentFormWhere(student, now),
        orderBy: { endsAt: "asc" },
        take: 30
      }),
      this.prisma.announcementRead.findMany({
        where: { userId },
        select: { announcementId: true, readAt: true }
      }),
      this.prisma.feedbackSubmission.findMany({
        where: { studentProfileId: student.id },
        select: { formId: true }
      })
    ]);

    const readMap = new Map(reads.map((r) => [r.announcementId, r.readAt]));
    const submitted = new Set(submissions.map((s) => s.formId));

    const announcementItems: StudentPortalNotificationFeedItem[] = announcementRows
      .filter((row) => this.scopeMatches(scope, campusIds, row))
      .map((row) => {
        const readAt = row.reads[0]?.readAt ?? readMap.get(row.id) ?? null;
        const createdAt = row.publishedAt ?? row.createdAt;
        return {
          id: `announcement:${row.id}`,
          kind: "ANNOUNCEMENT" as const,
          title: row.title,
          bodyPreview: row.body.length > 160 ? `${row.body.slice(0, 160)}…` : row.body,
          createdAt: createdAt.toISOString(),
          readAt: readAt?.toISOString() ?? null,
          href: `/student/engage/announcements?open=${row.id}`,
          priority: row.priority,
          pinned: row.pinned,
          announcementId: row.id
        };
      });

    const portalItems: StudentPortalNotificationFeedItem[] = portalRows.map((row) => ({
      id: `portal:${row.id}`,
      kind: row.kind === StudentPortalNotificationKind.FEEDBACK ? ("FEEDBACK" as const) : ("SYSTEM" as const),
      title: row.title,
      bodyPreview: row.body?.slice(0, 160) ?? "",
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      href: row.feedbackFormId ? `/student/feedback?form=${row.feedbackFormId}` : "/student/notifications",
      feedbackFormId: row.feedbackFormId ?? undefined,
      portalNotificationId: row.id
    }));

    const feedbackItems: StudentPortalNotificationFeedItem[] = feedbackForms
      .filter((form) => !submitted.has(form.id))
      .map((form) => ({
        id: `feedback-pending:${form.id}`,
        kind: "FEEDBACK" as const,
        title: `Feedback requested: ${form.title}`,
        bodyPreview: form.description.length > 160 ? `${form.description.slice(0, 160)}…` : form.description,
        createdAt: form.startsAt.toISOString(),
        readAt: null,
        href: `/student/feedback?form=${form.id}`,
        feedbackFormId: form.id
      }));

    return [...announcementItems, ...portalItems, ...feedbackItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private async countPendingFeedbackForms(userId: string) {
    let student: StudentPortalLoadedStudent;
    try {
      student = await loadStudentPortalProfile(this.prisma, userId);
    } catch {
      return 0;
    }
    const now = new Date();
    const forms = await this.prisma.feedbackForm.findMany({
      where: this.buildStudentFormWhere(student, now),
      select: { id: true }
    });
    if (!forms.length) return 0;
    const submitted = await this.prisma.feedbackSubmission.findMany({
      where: { studentProfileId: student.id, formId: { in: forms.map((f) => f.id) } },
      select: { formId: true }
    });
    const submittedSet = new Set(submitted.map((s) => s.formId));
    return forms.filter((f) => !submittedSet.has(f.id)).length;
  }

  private buildStudentFormWhere(
    student: StudentPortalLoadedStudent,
    now: Date
  ): Prisma.FeedbackFormWhereInput {
    const s = studentProfileToScope(student);
    const campusIds = campusIdsForSharedMatching(student);
    const structural: Prisma.FeedbackFormWhereInput[] = [
      { OR: [{ campusId: null }, { campusId: { in: campusIds } }] },
      { OR: [{ programId: null }, { programId: s.programId }] },
      { OR: [{ branchId: null }, { branchId: s.branchId }] },
      { OR: s.batchId ? [{ batchId: null }, { batchId: s.batchId }] : [{ batchId: null }] },
      { OR: [{ classId: null }, { classId: s.classId }] },
      { OR: [{ sectionId: null }, { sectionId: s.sectionId }] }
    ];
    return {
      AND: [{ status: FeedbackFormStatus.ACTIVE }, { startsAt: { lte: now } }, { endsAt: { gte: now } }, ...structural]
    };
  }

  private scopeMatches(
    scope: ReturnType<typeof studentProfileToScope>,
    campusIds: string[],
    announcement: {
      campusId: string | null;
      programId: string | null;
      branchId: string | null;
      batchId: string | null;
      classId: string | null;
      sectionId: string | null;
    }
  ) {
    const target = {
      campusId: announcement.campusId ?? undefined,
      programId: announcement.programId ?? undefined,
      branchId: announcement.branchId ?? undefined,
      batchId: announcement.batchId ?? undefined,
      classId: announcement.classId ?? undefined,
      sectionId: announcement.sectionId ?? undefined
    };
    return Object.entries(target).every(([key, value]) => {
      if (!value) return true;
      if (key === "campusId") return campusIds.includes(value);
      return scope[key as keyof typeof scope] === value;
    });
  }

  private assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access portal notifications.");
    }
  }

}
