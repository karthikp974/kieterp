export type StudentReceiptRow = {
  id: string;
  receiptNo: string;
  feeHead: string;
  amountRupees: number;
  paymentMode: string;
  paymentRecordStatus: string;
  paidPercentOfFee: number | null;
  coverageLabel: string;
  paidAt: string;
};

export type StudentReceiptsYearGroup = {
  yearNumber: number;
  yearLabel: string;
  isCurrentYear: boolean;
  receipts: StudentReceiptRow[];
};

export type StudentReceiptsResponse = {
  currency: "INR";
  student: { fullName: string; rollNumber: string };
  branch: { name: string; code: string };
  currentYearLabel: string;
  totalReceipts: number;
  years: StudentReceiptsYearGroup[];
};
