package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// CardRepo 는 ports.CardRepository 의 MongoDB 구현.
// 카드 콘텐츠(cards)와 개인 진행 상태(progress)를 별도 컬렉션으로 분리해,
// 동일 카드를 여러 사용자가 공유하면서 각자의 진행 상태만 갱신하도록 한다.
type CardRepo struct {
	cards    *mongo.Collection
	progress *mongo.Collection
}

// NewCardRepo 는 cards/progress 컬렉션 어댑터를 만든다.
func NewCardRepo(db *mongo.Database) *CardRepo {
	return &CardRepo{
		cards:    db.Collection("cards"),
		progress: db.Collection("progress"),
	}
}

func (r *CardRepo) AllCards(ctx context.Context) ([]domain.Card, error) {
	cur, err := r.cards.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []domain.Card
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *CardRepo) CountCards(ctx context.Context) (int64, error) {
	return r.cards.CountDocuments(ctx, bson.M{})
}

func (r *CardRepo) InsertCards(ctx context.Context, cards []domain.Card) error {
	if len(cards) == 0 {
		return nil
	}
	docs := make([]any, len(cards))
	for i := range cards {
		docs[i] = cards[i]
	}
	_, err := r.cards.InsertMany(ctx, docs)
	return err
}

func (r *CardRepo) ProgressFor(ctx context.Context, userID string) (map[string]domain.Progress, error) {
	cur, err := r.progress.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var rows []domain.Progress
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	out := make(map[string]domain.Progress, len(rows))
	for _, p := range rows {
		out[p.CardID] = p
	}
	return out, nil
}

func (r *CardRepo) UpsertProgress(ctx context.Context, p domain.Progress) error {
	_, err := r.progress.UpdateOne(ctx,
		bson.M{"user_id": p.UserID, "card_id": p.CardID},
		bson.M{"$set": p},
		options.Update().SetUpsert(true),
	)
	return err
}
