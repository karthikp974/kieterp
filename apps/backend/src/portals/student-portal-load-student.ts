import { NotFoundException } from "@nestjs/common";
import { Prisma, StructureStatus, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const studentPortalProfileInclude = {
  user: {
    select: {
      fullName: true,
      campusId: true,
      campus: { select: { id: true, code: true, groupId: true } }
    }
  },
  section: {
    include: {
      class: {
        include: {
          batch: {
            include: {
              branch: {
                include: {
                  program: {
                    include: {
                      campus: { select: { id: true, name: true, code: true, groupId: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
} satisfies Prisma.StudentProfileInclude;

export type StudentPortalLoadedStudent = Prisma.StudentProfileGetPayload<{ include: typeof studentPortalProfileInclude }>;

/** Active student with full section → class → program chain for portal features. */
export async function loadStudentPortalProfile(prisma: PrismaService, userId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    include: studentPortalProfileInclude
  });
  if (!student || student.currentStatus !== UserStatus.ACTIVE || student.isArchived) {
    throw new NotFoundException("Student profile not found.");
  }
  const section = student.section;
  if (
    !section ||
    section.status !== StructureStatus.ACTIVE ||
    section.isArchived ||
    section.class.status !== StructureStatus.ACTIVE ||
    section.class.isArchived ||
    section.class.batch.status !== StructureStatus.ACTIVE ||
    section.class.batch.isArchived ||
    section.class.batch.branch.status !== StructureStatus.ACTIVE ||
    section.class.batch.branch.isArchived ||
    section.class.batch.branch.program.status !== StructureStatus.ACTIVE ||
    section.class.batch.branch.program.isArchived
  ) {
    throw new NotFoundException("Student is not assigned to an active section.");
  }
  return student;
}
