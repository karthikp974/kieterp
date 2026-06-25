import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserType } from "@prisma/client";
import { AnnouncementsService } from "../announcements/announcements.service";
import { AuthUser } from "../auth/auth.types";
import { StudentAnnouncementsQueryDto } from "./student-announcements-portal.dto";

@Injectable()
export class StudentPortalAnnouncementsService {
  constructor(private readonly announcements: AnnouncementsService) {}

  list(user: AuthUser, query: StudentAnnouncementsQueryDto) {
    this.assertStudent(user);
    return this.announcements.list(user, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      includeReadStatus: true
    });
  }

  getOne(user: AuthUser, id: string) {
    this.assertStudent(user);
    return this.announcements.getOne(user, id);
  }

  markRead(user: AuthUser, id: string) {
    this.assertStudent(user);
    return this.announcements.markRead(user, id);
  }

  private assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access student portal announcements.");
    }
  }
}
