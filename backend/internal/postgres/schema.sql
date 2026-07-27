-- eduapp PostgreSQL 스키마 — 앱 부팅 시 EnsureSchema 가 실행한다.
-- 모든 문장은 IF NOT EXISTS 로 멱등(idempotent)하게 작성되어, 재기동해도 안전하다.
-- (스키마가 본격적으로 진화하면 goose/golang-migrate 로 버전 관리 전환을 권장.)

-- 사용자 계정.
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    login_id      TEXT NOT NULL UNIQUE,
    user_nm       TEXT NOT NULL DEFAULT '',
    nickname      TEXT NOT NULL DEFAULT '',
    email_addr    TEXT NOT NULL DEFAULT '',
    org_nm        TEXT NOT NULL DEFAULT '',
    job_title     TEXT NOT NULL DEFAULT '',
    membership_cd TEXT NOT NULL DEFAULT 'BASIC',
    -- 계정 권한. 멤버십(과금 등급)과 다른 축이다 — VIP 회원이 관리자가 되어서는 안 된다.
    role_cd       TEXT NOT NULL DEFAULT 'USER',
    password_hash TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_cd     TEXT NOT NULL DEFAULT 'A'
);

-- 이미 배포된 DB(role_cd 없던 시절)에도 안전하게 열을 추가한다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_cd TEXT NOT NULL DEFAULT 'USER';

-- 관리 콘솔 목록은 가입 최신순 + 필터가 기본이라 이 인덱스가 정렬을 받쳐준다.
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC, id DESC);

-- 닉네임 대소문자 무시 유일성(빈 닉네임은 제외). FindByNickname 조회도 이 인덱스를 탄다.
CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_lower_idx
    ON users (LOWER(nickname)) WHERE nickname <> '';

-- 학습 콘텐츠(진행 상태와 분리). keywords/choices 는 NULL 허용(도메인 nil 슬라이스와 왕복 일치).
CREATE TABLE IF NOT EXISTS cards (
    id                TEXT PRIMARY KEY,
    category_cd       TEXT NOT NULL DEFAULT '',
    sub_category_nm   TEXT NOT NULL DEFAULT '',
    topic_nm          TEXT NOT NULL DEFAULT '',
    keywords          TEXT[],
    title_txt         TEXT NOT NULL DEFAULT '',
    study_seconds     INTEGER NOT NULL DEFAULT 0,
    situation_txt     TEXT NOT NULL DEFAULT '',
    question_txt      TEXT NOT NULL DEFAULT '',
    image_url         TEXT NOT NULL DEFAULT '',
    principle_txt     TEXT NOT NULL DEFAULT '',
    process_txt       TEXT NOT NULL DEFAULT '',
    fire_triangle_txt TEXT NOT NULL DEFAULT '',
    conclusion_txt    TEXT NOT NULL DEFAULT '',
    answer_image_url  TEXT NOT NULL DEFAULT '',
    source_txt        TEXT NOT NULL DEFAULT '',
    difficulty_cd     TEXT NOT NULL DEFAULT 'EASY',
    card_type_cd      TEXT NOT NULL DEFAULT 'EXPLANATION',
    choices           TEXT[],
    answer_index      INTEGER
);

-- (user, card) 별 개인 학습 진행. 카드 하나를 여러 사용자가 공유한다.
CREATE TABLE IF NOT EXISTS progress (
    user_id   TEXT NOT NULL,
    card_id   TEXT NOT NULL,
    status_cd TEXT NOT NULL DEFAULT 'NEW',
    due_at    TIMESTAMPTZ,
    PRIMARY KEY (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS progress_user_idx ON progress (user_id);

-- 카드별 진행 집계(관리 대시보드의 '아무도 못 푸는 문제' 탐지)가 이 인덱스를 탄다.
CREATE INDEX IF NOT EXISTS progress_card_idx ON progress (card_id);

-- 원격 푸시 토큰(브로드캐스트 대상). token 을 PK 로 두어 재등록이 자연스럽게 업서트된다.
CREATE TABLE IF NOT EXISTS push_tokens (
    token      TEXT PRIMARY KEY,
    platform   TEXT NOT NULL DEFAULT '',
    user_id    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 관리자 행위 이력(append-only). 남의 계정과 학습 콘텐츠를 바꾸는 도구이므로
-- "누가·언제·무엇을" 을 남기지 않으면 사고가 났을 때 되짚을 방법이 없다.
CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT NOT NULL DEFAULT '',
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL DEFAULT '',
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    summary     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC, id DESC);
