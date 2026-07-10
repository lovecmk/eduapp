// Layer 2: Domain Model — PART 1.2
export interface User {
  id: string;
  name: string;
  email: string;
  org?: string; // 소속
  jobTitle?: string; // 직무
  createdAt: Date;
  isActive: boolean;
}
