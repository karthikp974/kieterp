import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile
} from "@nestjs/common";
import { StructureStatus, SyllabusResourceKind, UserType } from "@prisma/client";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "fs";
import { extname, join } from "path";
import { AuthUser } from "../auth/auth.types";
import { isPdfBuffer } from "../common/file-signature.util";
import { isPathWithinRoot } from "../common/safe-path.util";
import { PrismaService } from "../prisma/prisma.service";
import { loadStudentPortalProfile } from "./student-portal-load-student";
import { CreateSyllabusUnitResourceDto } from "./syllabus-unit-resources.dto";

const UPLOAD_ROOT = join(process.cwd(), "uploads", "syllabus-resources");
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const PDF_MIME = new Set(["application/pdf"]);

@Injectable()
export class SyllabusUnitResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForStudent(user: AuthUser, unitId: string) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only students can view unit resources.");
    }
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    await this.ensureUnitInStudentScope(student.sectionId, unitId);
    return this.listActive(unitId, student.sectionId);
  }

  async listForTeacher(user: AuthUser, unitId: string, sectionId: string) {
    await this.ensureTeacherCanManageUnit(user, unitId, sectionId);
    return this.listActive(unitId, sectionId);
  }

  async createForTeacher(user: AuthUser, unitId: string, dto: CreateSyllabusUnitResourceDto) {
    await this.ensureTeacherCanManageUnit(user, unitId, dto.sectionId);
    const kind = dto.kind;
    if (kind === SyllabusResourceKind.LINK && !dto.url?.trim()) {
      throw new BadRequestException("URL is required for link resources.");
    }
    if (kind === SyllabusResourceKind.NOTE && !dto.noteBody?.trim()) {
      throw new BadRequestException("Note text is required.");
    }

    const created = await this.prisma.syllabusUnitResource.create({
      data: {
        unitId,
        sectionId: dto.sectionId,
        kind,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        url: kind === SyllabusResourceKind.LINK ? dto.url!.trim() : null,
        noteBody: kind === SyllabusResourceKind.NOTE ? dto.noteBody!.trim() : null,
        uploadedById: user.id
      }
    });
    return this.toResourceResponse(created);
  }

  async uploadPdfForTeacher(
    user: AuthUser,
    unitId: string,
    sectionId: string,
    title: string,
    file: Express.Multer.File | undefined
  ) {
    await this.ensureTeacherCanManageUnit(user, unitId, sectionId);
    if (!file?.buffer?.length) throw new BadRequestException("PDF file is required.");
    if (!PDF_MIME.has(file.mimetype)) throw new BadRequestException("Only PDF files are allowed.");
    if (!isPdfBuffer(file.buffer)) throw new BadRequestException("File is not a valid PDF.");
    if (file.size > MAX_PDF_BYTES) throw new BadRequestException("PDF must be 12 MB or smaller.");

    if (!existsSync(UPLOAD_ROOT)) mkdirSync(UPLOAD_ROOT, { recursive: true });
    const safeExt = extname(file.originalname).toLowerCase() === ".pdf" ? ".pdf" : ".pdf";
    const fileName = `${unitId}-${sectionId}-${Date.now()}${safeExt}`;
    const absPath = join(UPLOAD_ROOT, fileName);
    writeFileSync(absPath, file.buffer);

    const created = await this.prisma.syllabusUnitResource.create({
      data: {
        unitId,
        sectionId,
        kind: SyllabusResourceKind.PDF,
        title: title.trim() || file.originalname.replace(/\.pdf$/i, "") || "PDF",
        filePath: fileName,
        uploadedById: user.id
      }
    });
    return this.toResourceResponse(created);
  }

  async archiveForTeacher(user: AuthUser, resourceId: string) {
    const resource = await this.prisma.syllabusUnitResource.findFirst({
      where: { id: resourceId, isArchived: false }
    });
    if (!resource) throw new NotFoundException("Resource not found.");
    await this.ensureTeacherCanManageUnit(user, resource.unitId, resource.sectionId);
    const archived = await this.prisma.syllabusUnitResource.update({
      where: { id: resourceId },
      data: { isArchived: true, archivedAt: new Date() }
    });
    return this.toResourceResponse(archived);
  }

  async downloadPdfForStudent(user: AuthUser, resourceId: string) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only students can download resources.");
    }
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const resource = await this.prisma.syllabusUnitResource.findFirst({
      where: { id: resourceId, isArchived: false, kind: SyllabusResourceKind.PDF }
    });
    if (!resource || resource.sectionId !== student.sectionId) {
      throw new NotFoundException("Resource not found.");
    }
    await this.ensureUnitInStudentScope(student.sectionId, resource.unitId);
    if (!resource.filePath) throw new NotFoundException("File missing.");
    const abs = join(UPLOAD_ROOT, resource.filePath);
    if (!isPathWithinRoot(UPLOAD_ROOT, abs)) throw new NotFoundException("Resource not found.");
    if (!existsSync(abs)) throw new NotFoundException("File not found on server.");
    const stream = createReadStream(abs);
    return new StreamableFile(stream, {
      type: "application/pdf",
      disposition: `attachment; filename="${resource.title.replace(/"/g, "")}.pdf"`
    });
  }

  private async listActive(unitId: string, sectionId: string) {
    const rows = await this.prisma.syllabusUnitResource.findMany({
      where: { unitId, sectionId, isArchived: false },
      orderBy: { createdAt: "desc" }
    });
    return { items: rows.map((row) => this.toResourceResponse(row)) };
  }

  private toResourceResponse(row: {
    id: string;
    unitId: string;
    sectionId: string;
    kind: SyllabusResourceKind;
    title: string;
    description: string | null;
    url: string | null;
    noteBody: string | null;
    filePath: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      unitId: row.unitId,
      sectionId: row.sectionId,
      kind: row.kind,
      title: row.title,
      description: row.description,
      url: row.url,
      noteBody: row.noteBody,
      hasFile: Boolean(row.filePath),
      createdAt: row.createdAt
    };
  }

  private async ensureUnitInStudentScope(sectionId: string, unitId: string) {
    const unit = await this.prisma.syllabusUnit.findFirst({
      where: { id: unitId, isArchived: false },
      include: { syllabus: { select: { subjectId: true, isArchived: true } } }
    });
    if (!unit || unit.syllabus.isArchived) throw new NotFoundException("Unit not found.");

    const assign = await this.prisma.sectionSubjectAssignment.findFirst({
      where: { sectionId, subjectId: unit.syllabus.subjectId, isActive: true }
    });
    if (assign) return unit;

    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { class: { include: { batch: true } } }
    });
    if (!section) throw new ForbiddenException("Section not found.");

    const inSemester = await this.prisma.subject.findFirst({
      where: {
        id: unit.syllabus.subjectId,
        branchId: section.class.batch.branchId,
        semesterNumber: section.class.semesterNumber,
        status: StructureStatus.ACTIVE,
        isArchived: false
      }
    });
    if (!inSemester) throw new ForbiddenException("Subject is not in your semester scope.");
    return unit;
  }

  private async ensureTeacherCanManageUnit(user: AuthUser, unitId: string, sectionId: string) {
    const unit = await this.prisma.syllabusUnit.findFirst({
      where: { id: unitId, isArchived: false },
      include: { syllabus: { select: { subjectId: true, isArchived: true } } }
    });
    if (!unit || unit.syllabus.isArchived) throw new NotFoundException("Unit not found.");
    const subjectId = unit.syllabus.subjectId;

    if (user.type === UserType.ADMIN) return;

    if (user.type !== UserType.TEACHER) {
      throw new ForbiddenException("Only teachers can manage syllabus resources.");
    }

    const role = await this.prisma.teacherRoleAssignment.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        sectionId,
        OR: [{ subjectId: null }, { subjectId }]
      }
    });
    if (!role) {
      throw new ForbiddenException("You are not assigned to this section for this subject.");
    }
  }
}
