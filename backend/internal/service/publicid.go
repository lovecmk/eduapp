package service

// 앱이 보는 사용자 id 는 서버의 진짜 id 가 아니다.
//
// 앱의 `UserDTO.id` 는 **number** 로 선언돼 있어서(`src/data/dto/UserDTO.ts`),
// 문자열 id(`u_demo`, `usr_1754…`)를 그대로 내보낼 수 없다. 그래서 응답에는
// 안정적인 정수로 축약한 값을 싣는다.
//
// 이 축약이 단방향이라는 점이 문제를 만든다 — 앱이 그 값을 서버로 되돌려 보내는
// 경로가 하나 있다. 내 정보 수정 화면의 닉네임 중복 검사다.
//
//	GET /api/auth/nickname-available?nickname=길동&exclude=<앱이 아는 내 id>
//
// `exclude` 는 "이 사람 본인의 현재 닉네임은 중복으로 보지 말라"는 뜻인데,
// 서버가 진짜 id 하고만 비교하면 **절대 일치하지 않는다.** 결과는 조용하고 고약하다:
// 닉네임을 그대로 둔 채 소속만 고치려 해도 "이미 사용 중인 닉네임입니다"가 뜨고,
// 사용자는 닉네임을 바꾸지 않는 한 자기 프로필을 저장할 수 없다.
//
// 그래서 비교를 한 곳에 모으고, **어느 쪽 표기로 오든** 같은 사람으로 인정한다.

// PublicUserID 는 사용자 id 를 앱이 쓰는 정수 형태로 축약한다(FNV-1a).
//
// 되돌릴 수 없는 축약이라 신뢰 경계로 쓰면 안 된다 — 이 값은 화면 표시와
// 본인 여부 판별에만 쓰고, 권한 판단은 언제나 토큰의 진짜 id 로 한다.
func PublicUserID(s string) int {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return int(h % 1_000_000_000)
}

// SameUser 는 외부에서 받은 id 표기가 이 사용자를 가리키는지 판정한다.
//
// 앱은 축약된 정수를, 관리 콘솔은 진짜 문자열 id 를 보낸다. 둘 다 받아들인다 —
// 어느 쪽을 보냈는지 호출부가 알아야 한다면 그 지식이 화면마다 흩어진다.
func SameUser(realID, given string) bool {
	if given == "" {
		return false
	}
	if realID == given {
		return true
	}
	// 같은 패키지의 itoa(sync_service.go)를 쓴다 — 숫자 → 문자열 변환이
	// 두 벌로 갈릴 이유가 없다.
	return itoa(PublicUserID(realID)) == given
}
