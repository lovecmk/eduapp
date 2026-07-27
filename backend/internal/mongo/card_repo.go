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

// --- 관리 콘솔(문제 만들기·고치기) --------------------------------------------

func (r *CardRepo) FindCard(ctx context.Context, id string) (*domain.Card, error) {
	var c domain.Card
	err := r.cards.FindOne(ctx, bson.M{"_id": id}).Decode(&c)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ports.ErrNotFound{Entity: "card"}
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *CardRepo) UpdateCard(ctx context.Context, c domain.Card) error {
	res, err := r.cards.ReplaceOne(ctx, bson.M{"_id": c.ID}, c)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ports.ErrNotFound{Entity: "card"}
	}
	return nil
}

// DeleteCard 는 카드와 딸린 진행 기록을 함께 지운다.
// Mongo 단일 노드에는 트랜잭션이 없을 수 있으므로 진행 기록을 **먼저** 지운다 —
// 중간에 실패해도 '카드 없는 진행 기록'(통계를 영구히 어긋나게 하는 쪽)은 남지 않는다.
func (r *CardRepo) DeleteCard(ctx context.Context, id string) error {
	if _, err := r.progress.DeleteMany(ctx, bson.M{"card_id": id}); err != nil {
		return err
	}
	res, err := r.cards.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ports.ErrNotFound{Entity: "card"}
	}
	return nil
}

func (r *CardRepo) ProgressSummary(ctx context.Context) (map[string]int64, error) {
	return r.countProgress(ctx, bson.M{})
}

func (r *CardRepo) ProgressCountFor(ctx context.Context, userID string) (map[string]int64, error) {
	return r.countProgress(ctx, bson.M{"user_id": userID})
}

func (r *CardRepo) countProgress(ctx context.Context, match bson.M) (map[string]int64, error) {
	cur, err := r.progress.Aggregate(ctx, []bson.M{
		{"$match": match},
		{"$group": bson.M{"_id": "$status_cd", "n": bson.M{"$sum": 1}}},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	out := map[string]int64{
		string(domain.StatusNew):      0,
		string(domain.StatusLearning): 0,
		string(domain.StatusMastered): 0,
	}
	var rows []struct {
		ID string `bson:"_id"`
		N  int64  `bson:"n"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ID] = r.N
	}
	return out, nil
}

func (r *CardRepo) CardProgressStats(ctx context.Context) (map[string]ports.CardStat, error) {
	cur, err := r.progress.Aggregate(ctx, []bson.M{
		{"$group": bson.M{
			"_id": "$card_id",
			"learning": bson.M{"$sum": bson.M{
				"$cond": []any{bson.M{"$eq": []any{"$status_cd", string(domain.StatusLearning)}}, 1, 0}}},
			"mastered": bson.M{"$sum": bson.M{
				"$cond": []any{bson.M{"$eq": []any{"$status_cd", string(domain.StatusMastered)}}, 1, 0}}},
		}},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var rows []struct {
		ID       string `bson:"_id"`
		Learning int64  `bson:"learning"`
		Mastered int64  `bson:"mastered"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	out := map[string]ports.CardStat{}
	for _, r := range rows {
		out[r.ID] = ports.CardStat{Learning: r.Learning, Mastered: r.Mastered}
	}
	return out, nil
}
