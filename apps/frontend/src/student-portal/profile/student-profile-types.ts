export type StudentProfileResponse = {
  personal: {
    avatarUrl: string | null;
    fullName: string;
    rollNumber: string;
    dateOfBirth: string | null;
    email: string;
    phone: string;
    guardianName: string;
    address: string;
    village: string;
    mandal: string;
    district: string;
    state: string;
    pincode: string;
    homeAddress: string;
  };
  academic: {
    campus: { name: string; code: string };
    department: { name: string; code: string };
    branch: { name: string; code: string };
    batch: { code: string };
    class: { label: string };
    section: { name: string; code: string | null };
    semesterNumber: number;
    semesterLabel: string;
  };
  editable: {
    phone: boolean;
    dateOfBirth: boolean;
    guardianName: boolean;
    address: boolean;
    avatar: boolean;
    fullName: boolean;
    rollNumber: boolean;
    email: boolean;
  };
};
