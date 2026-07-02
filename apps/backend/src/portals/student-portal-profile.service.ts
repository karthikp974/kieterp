import { ForbiddenException, Injectable } from "@nestjs/common";
import { formatIstDate } from "../common/ist-time.util";
import { Prisma, UserType } from "@prisma/client";
import { formatSemesterLabel } from "../common/semester-label.util";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { loadStudentPortalProfile } from "./student-portal-load-student";
import { UpdateStudentProfileDto } from "./student-profile-portal.dto";

@Injectable()
export class StudentPortalProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(user: AuthUser) {
    this.assertStudent(user);
    const student = await this.loadProfileStudent(user.id);
    return this.toProfileResponse(student);
  }

  async updateProfile(user: AuthUser, dto: UpdateStudentProfileDto) {
    this.assertStudent(user);
    const student = await this.loadProfileStudent(user.id);

    const userData: Prisma.UserUpdateInput = {};
    if (dto.phone !== undefined) {
      userData.phone = dto.phone.trim() || null;
    }

    const studentData: Prisma.StudentProfileUpdateInput = {};
    if (dto.dateOfBirth !== undefined) {
      studentData.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if (dto.guardianName !== undefined) {
      studentData.guardianName = dto.guardianName.trim() || null;
    }
    if (dto.address !== undefined) {
      studentData.address = dto.address.trim() || null;
    }
    if (dto.village !== undefined) studentData.village = dto.village.trim() || null;
    if (dto.mandal !== undefined) studentData.mandal = dto.mandal.trim() || null;
    if (dto.district !== undefined) studentData.district = dto.district.trim() || null;
    if (dto.state !== undefined) studentData.state = dto.state.trim() || null;
    if (dto.pincode !== undefined) studentData.pincode = dto.pincode.trim() || null;
    if (dto.homeAddress !== undefined) studentData.homeAddress = dto.homeAddress.trim() || null;

    if (Object.keys(userData).length) {
      await this.prisma.user.update({ where: { id: user.id }, data: userData });
    }
    if (Object.keys(studentData).length) {
      await this.prisma.studentProfile.update({ where: { id: student.id }, data: studentData });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.auditUserId,
        action: "UPDATE_STUDENT_PORTAL_PROFILE",
        entity: "StudentProfile",
        entityId: student.id,
        metadata: { fields: [...Object.keys(userData), ...Object.keys(studentData)] }
      }
    });

    const refreshed = await this.loadProfileStudent(user.id);
    return this.toProfileResponse(refreshed);
  }

  private async loadProfileStudent(userId: string) {
    const student = await loadStudentPortalProfile(this.prisma, userId);
    return this.prisma.studentProfile.findUniqueOrThrow({
      where: { id: student.id },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true, avatarPath: true, updatedAt: true } },
        section: {
          include: {
            class: {
              include: {
                batch: {
                  include: {
                    branch: {
                      include: {
                        program: { include: { campus: { select: { id: true, name: true, code: true } } } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  private toProfileResponse(
    student: Prisma.StudentProfileGetPayload<{
      include: {
        user: { select: { id: true; email: true; fullName: true; phone: true; avatarPath: true; updatedAt: true } };
        section: {
          include: {
            class: {
              include: {
                batch: {
                  include: {
                    branch: { include: { program: { include: { campus: { select: { id: true; name: true; code: true } } } } } };
                  };
                };
              };
            };
          };
        };
      };
    }>
  ) {
    const cls = student.section.class;
    const batch = cls.batch;
    const branch = batch.branch;
    const program = branch.program;
    const campus = program.campus;
    const avatarUrl = student.user.avatarPath
      ? `/api/auth/me/avatar?v=${new Date(student.user.updatedAt).getTime()}`
      : null;

    return {
      personal: {
        avatarUrl,
        fullName: student.user.fullName,
        rollNumber: student.rollNumber,
        dateOfBirth: student.dateOfBirth ? formatIstDate(student.dateOfBirth) : null,
        email: student.user.email,
        phone: student.user.phone ?? "",
        guardianName: student.guardianName ?? "",
        address: student.address ?? "",
        village: student.village ?? "",
        mandal: student.mandal ?? "",
        district: student.district ?? "",
        state: student.state ?? "",
        pincode: student.pincode ?? "",
        homeAddress: student.homeAddress ?? ""
      },
      academic: {
        campus: { name: campus.name, code: campus.code },
        department: { name: program.name, code: program.code },
        branch: { name: branch.name, code: branch.code },
        batch: { code: batch.batchCode },
        class: { label: cls.label },
        section: { name: student.section.name, code: student.section.code },
        semesterNumber: cls.semesterNumber,
        semesterLabel: formatSemesterLabel(cls.semesterNumber)
      },
      editable: {
        phone: true,
        dateOfBirth: true,
        guardianName: true,
        address: true,
        village: true,
        mandal: true,
        district: true,
        state: true,
        pincode: true,
        homeAddress: true,
        avatar: true,
        fullName: false,
        rollNumber: false,
        email: false
      }
    };
  }

  private assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access student portal profile.");
    }
  }
}
