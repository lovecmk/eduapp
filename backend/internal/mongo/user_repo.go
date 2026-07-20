package mongo

import (
	"context"
	"errors"
	"regexp"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// UserRepo 는 ports.UserRepository 의 MongoDB 구현.
type UserRepo struct{ col *mongo.Collection }

// NewUserRepo 는 users 컬렉션 어댑터를 만든다.
func NewUserRepo(db *mongo.Database) *UserRepo {
	return &UserRepo{col: db.Collection("users")}
}

func (r *UserRepo) FindByLoginID(ctx context.Context, loginID string) (*domain.User, error) {
	return r.findOne(ctx, bson.M{"login_id": loginID})
}

func (r *UserRepo) FindByNickname(ctx context.Context, nickname string) (*domain.User, error) {
	// 대소문자 무시 정확 매칭(정규식 특수문자 이스케이프).
	pattern := "^" + regexp.QuoteMeta(nickname) + "$"
	return r.findOne(ctx, bson.M{"nickname": bson.M{"$regex": pattern, "$options": "i"}})
}

func (r *UserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	return r.findOne(ctx, bson.M{"_id": id})
}

func (r *UserRepo) findOne(ctx context.Context, filter bson.M) (*domain.User, error) {
	var u domain.User
	err := r.col.FindOne(ctx, filter).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ports.ErrNotFound{Entity: "user"}
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) Create(ctx context.Context, u *domain.User) error {
	_, err := r.col.InsertOne(ctx, u)
	return err
}

func (r *UserRepo) Update(ctx context.Context, u *domain.User) error {
	res, err := r.col.ReplaceOne(ctx, bson.M{"_id": u.ID}, u)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ports.ErrNotFound{Entity: "user"}
	}
	return nil
}

func (r *UserRepo) Count(ctx context.Context) (int64, error) {
	return r.col.CountDocuments(ctx, bson.M{})
}
