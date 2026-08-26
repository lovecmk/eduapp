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
  /**
   * 등급 코드. **타입을 좁히지 않는다** — 이건 서버가 보내는 값이라 앱이 아는
   * 목록에 있으리라는 보장이 없다. 좁혀 두면 컴파일러가 "이미 안전하다"고
   * 말해 주는 바람에 매퍼가 검증을 건너뛰고, 서버가 새 등급을 하나 추가하는
   * 순간 화면이 undefined 를 읽다 죽는다(실제로 MY 탭이 그렇게 죽었다).
   */
  membership_cd?: string;
  /** 계정 권한. 관리자 전용 기능을 보여줄지 판단하는 데 쓴다. */
  role_cd?: string;
  created_at: string;
  status_cd: 'A' | 'I' | 'D';
}

export interface AuthResultDTO {
  access_token: string;
  refresh_token: string;
  user: UserDTO;
}
