// Layer 1: Raw DTO — PART 1.2 (백엔드 snake_case 응답 그대로)
export interface UserDTO {
  id: number;
  /** 로그인 아이디(표시 전용) */
  login_id?: string;
  user_nm: string;
  /** 공개 닉네임(선택) */
  nickname?: string;
  email_addr: string;
  org_nm?: string;
  job_title?: string;
  membership_cd?: 'BASIC' | 'PREMIUM' | 'VIP';
  created_at: string;
  status_cd: 'A' | 'I' | 'D';
}

export interface AuthResultDTO {
  access_token: string;
  refresh_token: string;
  user: UserDTO;
}
