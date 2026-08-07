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

// CollectionRepo 는 ports.CollectionRepository 의 MongoDB 구현.
// 사용자 한 명이 문서 하나 — 도감은 늘 통째로 읽고 통째로 쓴다.
type CollectionRepo struct{ col *mongo.Collection }

// NewCollectionRepo 는 도감 어댑터를 만든다.
func NewCollectionRepo(db *mongo.Database) *CollectionRepo {
	return &CollectionRepo{col: db.Collection("user_collection")}
}

func (r *CollectionRepo) LoadCollection(ctx context.Context, userID string) (domain.Collection, error) {
	var c domain.Collection
	err := r.col.FindOne(ctx, bson.M{"_id": userID}).Decode(&c)
	if errors.Is(err, mongo.ErrNoDocuments) {
		// 아직 아무것도 모으지 않았다 — 정상 상태다.
		return domain.NewCollection(userID), nil
	}
	if err != nil {
		return domain.NewCollection(userID), err
	}
	c.UserID = userID
	if c.Owned == nil {
		c.Owned = map[string]int{}
	}
	if c.ClaimedRules == nil {
		c.ClaimedRules = map[string]int{}
	}
	if c.RedeemedCodes == nil {
		c.RedeemedCodes = []string{}
	}
	return c, nil
}

func (r *CollectionRepo) SaveCollection(ctx context.Context, c domain.Collection) error {
	doc := bson.M{
		"user_id":         c.UserID,
		"owned":           orEmptyIntMap(c.Owned),
		"packs_earned":    c.PacksEarned,
		"packs_opened":    c.PacksOpened,
		"shards_earned":   c.ShardsEarned,
		"shards_spent":    c.ShardsSpent,
		"study_total":     c.StudyTotal,
		"claimed_rules":   orEmptyIntMap(c.ClaimedRules),
		"redeemed_codes":  orEmptyStrings(c.RedeemedCodes),
		"last_daily_pack": c.LastDailyPack,
		"since_epic":      c.SinceEpic,
		"since_legendary": c.SinceLegendary,
		"updated_at":      c.UpdatedAt,
	}
	_, err := r.col.UpdateOne(ctx, bson.M{"_id": c.UserID}, bson.M{"$set": doc}, options.Update().SetUpsert(true))
	return err
}

func orEmptyIntMap(m map[string]int) map[string]int {
	if m == nil {
		return map[string]int{}
	}
	return m
}

func orEmptyStrings(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

var _ ports.CollectionRepository = (*CollectionRepo)(nil)
