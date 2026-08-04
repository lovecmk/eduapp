package mongo

import (
	"context"
	"errors"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// settingsDocID 는 운영 설정 단일 문서의 고정 _id.
// 설정은 반드시 한 벌이어야 한다 — 키가 자유로우면 두 번째 문서가 조용히 생기고,
// 그때부터 어느 것이 진짜인지 아무도 확신할 수 없다.
const settingsDocID = "ops"

// SettingsRepo 는 ports.SettingsRepository 의 MongoDB 구현.
type SettingsRepo struct{ col *mongo.Collection }

// NewSettingsRepo 는 운영 설정 어댑터를 만든다.
func NewSettingsRepo(db *mongo.Database) *SettingsRepo {
	return &SettingsRepo{col: db.Collection("ops_settings")}
}

func (r *SettingsRepo) LoadSettings(ctx context.Context) (domain.OpsSettings, error) {
	var s domain.OpsSettings
	err := r.col.FindOne(ctx, bson.M{"_id": settingsDocID}).Decode(&s)
	if errors.Is(err, mongo.ErrNoDocuments) {
		// 아무도 바꾼 적이 없다 — 정상 상태다.
		return domain.DefaultOpsSettings(), nil
	}
	if err != nil {
		return domain.DefaultOpsSettings(), err
	}
	return s, nil
}

func (r *SettingsRepo) SaveSettings(ctx context.Context, s domain.OpsSettings) error {
	_, err := r.col.UpdateOne(ctx,
		bson.M{"_id": settingsDocID},
		bson.M{"$set": bson.M{
			"maintenance_yn": s.MaintenanceYn, "maintenance_msg": s.MaintenanceMsg,
			"signup_enabled": s.SignupEnabled, "daily_new_limit": s.DailyNewLimit,
			"notice_txt": s.NoticeTxt, "notice_level": string(s.NoticeLevel),
			"updated_at": s.UpdatedAt, "updated_by": s.UpdatedBy, "updated_by_name": s.UpdatedByName,
		}},
		options.Update().SetUpsert(true),
	)
	return ignoreDuplicate(err)
}

var _ ports.SettingsRepository = (*SettingsRepo)(nil)

// AnnouncementRepo 는 ports.AnnouncementRepository 의 MongoDB 구현.
type AnnouncementRepo struct{ col *mongo.Collection }

// NewAnnouncementRepo 는 공지 이력 어댑터를 만든다.
func NewAnnouncementRepo(db *mongo.Database) *AnnouncementRepo {
	return &AnnouncementRepo{col: db.Collection("announcements")}
}

func (r *AnnouncementRepo) AppendAnnouncement(ctx context.Context, a domain.Announcement) error {
	_, err := r.col.InsertOne(ctx, a)
	return ignoreDuplicate(err)
}

func (r *AnnouncementRepo) ListAnnouncements(ctx context.Context, limit int) ([]domain.Announcement, error) {
	if limit <= 0 {
		limit = 50
	}
	cur, err := r.col.Find(ctx, bson.M{},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}).
			SetLimit(int64(limit)))
	if err != nil {
		return nil, err
	}
	out := []domain.Announcement{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

var _ ports.AnnouncementRepository = (*AnnouncementRepo)(nil)
