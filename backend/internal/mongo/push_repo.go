package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// PushTokenRepo 는 ports.PushTokenRepository 의 MongoDB 구현.
// _id 를 토큰 문자열로 사용해 같은 기기의 재등록이 자연스럽게 업서트되게 한다.
type PushTokenRepo struct{ col *mongo.Collection }

// NewPushTokenRepo 는 push_tokens 컬렉션 어댑터를 만든다.
func NewPushTokenRepo(db *mongo.Database) *PushTokenRepo {
	return &PushTokenRepo{col: db.Collection("push_tokens")}
}

func (r *PushTokenRepo) Save(ctx context.Context, t domain.PushToken) error {
	_, err := r.col.UpdateOne(ctx,
		bson.M{"_id": t.Token},
		bson.M{"$set": bson.M{
			"platform":   t.Platform,
			"user_id":    t.UserID,
			"updated_at": t.UpdatedAt,
		}, "$setOnInsert": bson.M{"created_at": t.CreatedAt}},
		options.Update().SetUpsert(true),
	)
	return err
}

func (r *PushTokenRepo) All(ctx context.Context) ([]domain.PushToken, error) {
	cur, err := r.col.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []domain.PushToken
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *PushTokenRepo) Delete(ctx context.Context, token string) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": token})
	return err
}
