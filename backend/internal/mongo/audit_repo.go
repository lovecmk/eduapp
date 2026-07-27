package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// AuditRepo 는 ports.AuditRepository 의 MongoDB 구현.
// 관리자 행위 이력은 사고 조사의 근거이므로 append-only 로만 다룬다
// (수정·삭제 메서드를 아예 두지 않는다).
type AuditRepo struct{ col *mongo.Collection }

// NewAuditRepo 는 audit_logs 컬렉션 어댑터를 만든다.
func NewAuditRepo(db *mongo.Database) *AuditRepo {
	return &AuditRepo{col: db.Collection("audit_logs")}
}

func (r *AuditRepo) Append(ctx context.Context, l domain.AuditLog) error {
	_, err := r.col.InsertOne(ctx, l)
	return err
}

func (r *AuditRepo) List(ctx context.Context, limit int) ([]domain.AuditLog, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	opt := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(int64(limit))

	cur, err := r.col.Find(ctx, bson.M{}, opt)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	out := []domain.AuditLog{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}
