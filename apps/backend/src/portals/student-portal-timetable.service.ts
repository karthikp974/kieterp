import { ForbiddenException, Injectable } from "@nestjs/common";
import { TimetableSlotStatus, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { buildSectionTimetableGridRows, SECTION_TIMETABLE_DAYS } from "../timetable/build-section-timetable-grid";
import { loadStudentPortalProfile } from "./student-portal-load-student";

@Injectable()
export class StudentPortalTimetableService {
  constructor(private readonly prisma: PrismaService) {}

  assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access the student timetable.");
    }
  }

  async getSectionTimetableGrid(user: AuthUser) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const sectionId = student.sectionId;

    const slots = await this.prisma.timetableSlot.findMany({
      where: { sectionId, status: TimetableSlotStatus.ACTIVE },
      include: {
        subject: { select: { code: true, name: true } },
        teacherProfile: { include: { user: { select: { fullName: true } } } }
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
    });

    const now = new Date();
    const todayDow = this.todayDayOfWeek(now);
    const rows = buildSectionTimetableGridRows(slots);

    const cls = student.section.class;
    const prog = cls.batch.branch.program;

    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
        rollNumber: student.rollNumber
      },
      section: {
        id: student.section.id,
        name: student.section.name,
        code: student.section.code,
        classLabel: cls.label,
        semesterNumber: cls.semesterNumber,
        batchCode: cls.batch.batchCode,
        branchName: cls.batch.branch.name,
        departmentName: prog.name,
        campusName: prog.campus.name,
        label: `${cls.label} · ${student.section.name}`
      },
      meta: {
        todayDayOfWeek: todayDow,
        generatedAt: now.toISOString()
      },
      days: SECTION_TIMETABLE_DAYS.map((d) => ({ dayOfWeek: d.dayOfWeek, label: d.label })),
      rows
    };
  }

  private todayDayOfWeek(now: Date) {
    const day = now.getDay();
    return day === 0 ? 7 : day;
  }
}
