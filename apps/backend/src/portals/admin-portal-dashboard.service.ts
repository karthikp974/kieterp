import { BadRequestException, Injectable } from "@nestjs/common";
import { FeePaymentStatus, Prisma, StudentFeePaymentStatus, UserStatus, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { formatIstDate, istDayRangeFromIso, todayIstDate } from "../common/ist-time.util";
import { isInstitutionWideAdmin } from "../permissions/campus-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";
import { ADMIN_DASHBOARD_CACHE_PREFIX, DASHBOARD_CACHE_TTL_SECONDS } from "../cache/cache.constants";

@Injectable()
export class AdminPortalDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService
  ) {}

  async summary(user: AuthUser) {
    // Cached per scope + day (45s TTL). Invalidated on fee-payment mutations.
    const scopeKey = isInstitutionWideAdmin(user)
      ? "all"
      : user.campusId
        ? `c:${user.campusId}`
        : user.campusGroupId
          ? `g:${user.campusGroupId}`
          : "none";
    return this.cache.getOrSet(
      `${ADMIN_DASHBOARD_CACHE_PREFIX}${scopeKey}:${todayIstDate()}`,
      DASHBOARD_CACHE_TTL_SECONDS,
      () => this.computeSummary(user)
    );
  }

  private async computeSummary(user: AuthUser) {
    const studentWhere = this.studentScopeWhere(user);
    const paymentWhere = this.paymentScopeWhere(user);
    const todayRange = istDayRangeFromIso(todayIstDate());

    const [students, teachers, todayPaymentsAgg, pendingAssignments, recentPayments, programCounts] = await Promise.all([
      this.prisma.studentProfile.count({ where: studentWhere }),
      this.prisma.teacherProfile.count({
        where: {
          isArchived: false,
          user: {
            status: UserStatus.ACTIVE,
            ...(user.campusId ? { campusId: user.campusId } : user.campusGroupId ? { campus: { groupId: user.campusGroupId } } : {})
          }
        }
      }),
      this.prisma.feePayment.aggregate({
        where: {
          ...paymentWhere,
          paidAt: { gte: todayRange.start, lte: todayRange.end }
        },
        _sum: { amount: true },
        _count: { id: true }
      }),
      this.prisma.studentFeeAssignment.count({
        where: {
          paymentStatus: StudentFeePaymentStatus.UNPAID,
          student: studentWhere
        }
      }),
      this.prisma.feePayment.findMany({
        where: paymentWhere,
        include: {
          studentProfile: { include: { user: { select: { fullName: true } } } },
          feeHead: { select: { name: true } }
        },
        orderBy: { paidAt: "desc" },
        take: 8
      }),
      this.prisma.studentProfile.findMany({
        where: studentWhere,
        select: {
          section: {
            select: {
              class: {
                select: {
                  batch: {
                    select: {
                      branch: {
                        select: {
                          program: { select: { code: true } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      })
    ]);

    const departmentBuckets = { DIPLOMA: 0, BTECH: 0, MTECH: 0, PG: 0 };
    for (const row of programCounts) {
      const code = row.section?.class?.batch?.branch?.program?.code?.toUpperCase() ?? "";
      if (code === "DIPLOMA") departmentBuckets.DIPLOMA += 1;
      else if (code === "BTECH") departmentBuckets.BTECH += 1;
      else if (code === "MTECH") departmentBuckets.MTECH += 1;
      else if (code === "MBA" || code === "MCA") departmentBuckets.PG += 1;
    }

    const branchStats = [
      { code: "BTECH", label: "B.Tech", count: departmentBuckets.BTECH },
      { code: "MTECH", label: "M.Tech", count: departmentBuckets.MTECH },
      { code: "DIPLOMA", label: "Diploma", count: departmentBuckets.DIPLOMA },
      { code: "PG", label: "PG", count: departmentBuckets.PG }
    ];

    return {
      stats: {
        students,
        teachers,
        feeCollected: Number(todayPaymentsAgg._sum.amount ?? 0),
        feeCollectedTodayCount: todayPaymentsAgg._count,
        feePending: pendingAssignments
      },
      branchStats,
      recentPayments: recentPayments.map((payment) => ({
        id: payment.id,
        student: payment.studentProfile.user.fullName,
        amount: Number(payment.amount),
        feeHead: payment.feeHead.name,
        paidAt: payment.paidAt.toISOString(),
        status: payment.status
      }))
    };
  }

  async dailyCollectionBreakdown(user: AuthUser) {
    const payments = await this.prisma.feePayment.findMany({
      where: this.paymentScopeWhere(user),
      select: { paidAt: true, amount: true },
      orderBy: { paidAt: "desc" }
    });

    const buckets = new Map<string, { collectedAmount: number; paymentCount: number }>();
    for (const payment of payments) {
      const paymentDate = formatIstDate(payment.paidAt);
      const row = buckets.get(paymentDate) ?? { collectedAmount: 0, paymentCount: 0 };
      row.collectedAmount += Number(payment.amount);
      row.paymentCount += 1;
      buckets.set(paymentDate, row);
    }

    const days = [...buckets.entries()]
      .map(([paymentDate, stats]) => ({
        paymentDate,
        collectedAmount: stats.collectedAmount,
        paymentCount: stats.paymentCount
      }))
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

    return {
      today: todayIstDate(),
      days,
      totalCollected: days.reduce((sum, day) => sum + day.collectedAmount, 0),
      totalPayments: days.reduce((sum, day) => sum + day.paymentCount, 0)
    };
  }

  async dayPayments(user: AuthUser, dateIso: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      throw new BadRequestException("Invalid payment date.");
    }

    const { start, end } = istDayRangeFromIso(dateIso);
    const payments = await this.prisma.feePayment.findMany({
      where: {
        ...this.paymentScopeWhere(user),
        paidAt: { gte: start, lte: end }
      },
      include: {
        studentProfile: {
          include: {
            user: { select: { fullName: true } },
            section: {
              include: {
                class: {
                  include: {
                    batch: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [{ paidAt: "desc" }]
    });

    const rows = payments.map((payment) => ({
      id: payment.id,
      studentName: payment.studentProfile.user.fullName,
      rollNumber: payment.studentProfile.rollNumber,
      batchYear: `${payment.studentProfile.section.class.batch.startYear}-${payment.studentProfile.section.class.batch.endYear}`,
      classLabel: payment.studentProfile.section.class.label || `Semester ${payment.studentProfile.section.class.semesterNumber}`,
      sectionName: payment.studentProfile.section.name,
      amount: Number(payment.amount),
      paidAt: payment.paidAt.toISOString()
    }));

    return {
      paymentDate: dateIso,
      totalCollected: rows.reduce((sum, row) => sum + row.amount, 0),
      paymentCount: rows.length,
      payments: rows
    };
  }

  private studentScopeWhere(user: AuthUser): Prisma.StudentProfileWhereInput {
    return {
      isArchived: false,
      currentStatus: UserStatus.ACTIVE,
      ...(user.type === UserType.ADMIN && !isInstitutionWideAdmin(user) && user.campusId
        ? { user: { campusId: user.campusId } }
        : user.campusGroupId
          ? { user: { campus: { groupId: user.campusGroupId } } }
          : {})
    };
  }

  private paymentScopeWhere(user: AuthUser): Prisma.FeePaymentWhereInput {
    return {
      status: FeePaymentStatus.ACTIVE,
      studentProfile: this.studentScopeWhere(user)
    };
  }
}
