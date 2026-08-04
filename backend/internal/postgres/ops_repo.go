package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// settingsRowID 는 운영 설정 단일 행의 고정 키.
//
// 자동 증가 id 를 쓰지 않는 이유 — 설정은 반드시 한 벌이어야 한다. 키가 자유로우면
// 저장 경로의 실수 한 번으로 두 번째 행이 생기고, 그때부터 "어느 것이 진짜인가"를
// 아무도 확신할 수 없다(읽는 쪽은 하나만 집어 오므로 증상도 늦게 드러난다).
const settingsRowID = "ops"

// SettingsRepo 는 ports.SettingsRepository 의 PostgreSQL 구현.
type SettingsRepo struct{ pool *pgxpool.Pool }

// NewSettingsRepo 는 운영 설정 어댑터를 만든다.
func NewSettingsRepo(pool *pgxpool.Pool) *SettingsRepo { return &SettingsRepo{pool: pool} }

func (r *SettingsRepo) LoadSettings(ctx context.Context) (domain.OpsSettings, error) {
	var s domain.OpsSettings
	err := r.pool.QueryRow(ctx,
		`SELECT maintenance_yn, maintenance_msg, signup_enabled, daily_new_limit,
		        notice_txt, notice_level, updated_at, updated_by, updated_by_name
		 FROM ops_settings WHERE id=$1`, settingsRowID).
		Scan(&s.MaintenanceYn, &s.MaintenanceMsg, &s.SignupEnabled, &s.DailyNewLimit,
			&s.NoticeTxt, &s.NoticeLevel, &s.UpdatedAt, &s.UpdatedBy, &s.UpdatedByName)
	if errors.Is(err, pgx.ErrNoRows) {
		// 아무도 바꾼 적이 없다 — 정상 상태다.
		return domain.DefaultOpsSettings(), nil
	}
	if err != nil {
		return domain.DefaultOpsSettings(), err
	}
	return s, nil
}

func (r *SettingsRepo) SaveSettings(ctx context.Context, s domain.OpsSettings) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO ops_settings (id, maintenance_yn, maintenance_msg, signup_enabled,
		     daily_new_limit, notice_txt, notice_level, updated_at, updated_by, updated_by_name)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 ON CONFLICT (id) DO UPDATE SET
		   maintenance_yn=EXCLUDED.maintenance_yn, maintenance_msg=EXCLUDED.maintenance_msg,
		   signup_enabled=EXCLUDED.signup_enabled, daily_new_limit=EXCLUDED.daily_new_limit,
		   notice_txt=EXCLUDED.notice_txt, notice_level=EXCLUDED.notice_level,
		   updated_at=EXCLUDED.updated_at, updated_by=EXCLUDED.updated_by,
		   updated_by_name=EXCLUDED.updated_by_name`,
		settingsRowID, s.MaintenanceYn, s.MaintenanceMsg, s.SignupEnabled, s.DailyNewLimit,
		s.NoticeTxt, string(s.NoticeLevel), s.UpdatedAt, s.UpdatedBy, s.UpdatedByName)
	return err
}

var _ ports.SettingsRepository = (*SettingsRepo)(nil)

// AnnouncementRepo 는 ports.AnnouncementRepository 의 PostgreSQL 구현.
type AnnouncementRepo struct{ pool *pgxpool.Pool }

// NewAnnouncementRepo 는 공지 이력 어댑터를 만든다.
func NewAnnouncementRepo(pool *pgxpool.Pool) *AnnouncementRepo { return &AnnouncementRepo{pool: pool} }

func (r *AnnouncementRepo) AppendAnnouncement(ctx context.Context, a domain.Announcement) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO announcements (id, title_txt, desc_txt, type_cd, audience_cd, audience_value,
		     audience_label, recipients, push_yn, actor_id, actor_name, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
		a.ID, a.TitleTxt, a.DescTxt, a.TypeCd, string(a.AudienceCd), a.AudienceValue,
		a.AudienceLabel, a.Recipients, a.PushYn, a.ActorID, a.ActorName, a.CreatedAt)
	return err
}

func (r *AnnouncementRepo) ListAnnouncements(ctx context.Context, limit int) ([]domain.Announcement, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, title_txt, desc_txt, type_cd, audience_cd, audience_value, audience_label,
		        recipients, push_yn, actor_id, actor_name, created_at
		 FROM announcements ORDER BY created_at DESC, id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Announcement{}
	for rows.Next() {
		var a domain.Announcement
		if err := rows.Scan(&a.ID, &a.TitleTxt, &a.DescTxt, &a.TypeCd, &a.AudienceCd,
			&a.AudienceValue, &a.AudienceLabel, &a.Recipients, &a.PushYn,
			&a.ActorID, &a.ActorName, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

var _ ports.AnnouncementRepository = (*AnnouncementRepo)(nil)
