export type StudentAnnouncementListItem = {
  id: string;
  title: string;
  body: string;
  audience: string;
  status: string;
  priority: string;
  pinned: boolean;
  createdBy: string;
  createdById: string;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  readAt: string | null;
  attachments: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
};

export type StudentAnnouncementsListResponse = {
  items: StudentAnnouncementListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type StudentAnnouncementDetailResponse = {
  announcement: StudentAnnouncementListItem & { body: string };
};
