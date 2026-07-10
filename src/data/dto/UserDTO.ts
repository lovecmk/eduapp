// Layer 1: Raw DTO — PART 1.2 (백엔드 snake_case 응답 그대로)
export interface UserDTO {
  id: number;
  user_nm: string;
  email_addr: string;
  org_nm?: string;
  job_title?: string;
  created_at: string;
  status_cd: 'A' | 'I' | 'D';
}

export interface AuthResultDTO {
  access_token: string;
  refresh_token: string;
  user: UserDTO;
}
