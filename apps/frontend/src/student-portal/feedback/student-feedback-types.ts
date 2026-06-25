export type StudentFeedbackLifecycle = "UPCOMING" | "PENDING" | "SUBMITTED" | "EXPIRED";

export type StudentFeedbackListItem = {
  id: string;
  title: string;
  descriptionPreview: string;
  formType: string;
  customType: string | null;
  startsAt: string;
  endsAt: string;
  assignedBy: string;
  questionCount: number;
  allowMultiple: boolean;
  lifecycleStatus: StudentFeedbackLifecycle;
  canSubmit: boolean;
  submittedAt: string | null;
};

export type StudentFeedbackListResponse = {
  items: StudentFeedbackListItem[];
  grouped: {
    pending: StudentFeedbackListItem[];
    submitted: StudentFeedbackListItem[];
    expired: StudentFeedbackListItem[];
  };
  total: number;
  page: number;
  pageSize: number;
};

export type StudentFeedbackQuestion = {
  id: string;
  order: number;
  type: "RATING_SCALE" | "YES_NO" | "MULTIPLE_CHOICE" | "PARAGRAPH";
  prompt: string;
  required: boolean;
  options: unknown;
};

export type StudentFeedbackDetailResponse = {
  form: {
    id: string;
    title: string;
    description: string;
    formType: string;
    customType: string | null;
    startsAt: string;
    endsAt: string;
    anonymous: boolean;
    allowMultiple: boolean;
    status: string;
    assignedBy: string;
    questions: StudentFeedbackQuestion[];
  };
  lifecycleStatus: StudentFeedbackLifecycle;
  canSubmit: boolean;
  readOnly: boolean;
  submission: {
    id: string;
    submittedAt: string;
    answers: { questionId: string; value: unknown }[];
  } | null;
};
