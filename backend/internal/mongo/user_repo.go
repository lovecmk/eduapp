package mongo

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

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
	return translateUserConflict(err)
}

// EnsureIndexes 는 유일성 제약을 실제로 강제하는 인덱스를 만든다.
//
// 이 인덱스가 없던 동안 mongo 는 세 저장소 중 유일하게 아무 제약이 없었고,
// 같은 아이디로 동시에 가입하면 계정이 여러 개 만들어져 마지막 하나만 로그인됐다.
// 애플리케이션의 사전 검사는 동시 요청을 막지 못하므로, 저장소가 직접 막아야 한다.
//
// nickname 은 부분 인덱스로 둔다 — 닉네임을 정하지 않은 계정이 여럿이어도
// 서로 충돌하면 안 되기 때문이다. collation strength 2 는 대소문자를 무시한다
// (FindByNickname·Postgres 의 LOWER() 인덱스와 같은 규칙).
func (r *UserRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "login_id", Value: 1}},
			Options: options.Index().SetName("login_id_unique").SetUnique(true),
		},
		{
			Keys: bson.D{{Key: "nickname", Value: 1}},
			Options: options.Index().SetName("nickname_unique_ci").SetUnique(true).
				SetPartialFilterExpression(bson.M{"nickname": bson.M{"$gt": ""}}).
				SetCollation(&options.Collation{Locale: "en", Strength: 2}),
		},
	})
	return err
}

// translateUserConflict 는 중복 키 오류를 도메인 오류로 옮긴다.
// 번역하지 않으면 드라이버 오류가 그대로 500 이 되어, 사용자는 아이디가 겹쳤다는
// 사실 대신 "서버 오류"를 보게 된다.
func translateUserConflict(err error) error {
	if err == nil || !mongo.IsDuplicateKeyError(err) {
		return err
	}
	if strings.Contains(err.Error(), "nickname") {
		return ports.ErrConflict{Field: "nickname"}
	}
	return ports.ErrConflict{Field: "login_id"}
}

func (r *UserRepo) Update(ctx context.Context, u *domain.User) error {
	res, err := r.col.ReplaceOne(ctx, bson.M{"_id": u.ID}, u)
	if err != nil {
		return translateUserConflict(err)
	}
	if res.MatchedCount == 0 {
		return ports.ErrNotFound{Entity: "user"}
	}
	return nil
}

func (r *UserRepo) Count(ctx context.Context) (int64, error) {
	return r.col.CountDocuments(ctx, bson.M{})
}

// --- 관리 콘솔 ---------------------------------------------------------------

func (r *UserRepo) List(ctx context.Context, q ports.UserQuery) ([]domain.User, int64, error) {
	filter := userFilter(q)

	total, err := r.col.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	limit := int64(q.Limit)
	if limit <= 0 {
		limit = 50
	}
	offset := int64(q.Offset)
	if offset < 0 {
		offset = 0
	}
	// 동률에 대비해 _id 를 최종 정렬 키로 둔다(페이지 간 중복/누락 방지).
	dir := 1
	if q.Desc {
		dir = -1
	}
	// 정렬 키는 ParseSortField 로 좁혀진 상수만 쓴다(임의 필드 정렬 차단).
	field := sortKey(ports.ParseSortField(string(q.Sort)))
	opt := options.Find().
		SetSort(bson.D{{Key: field, Value: dir}, {Key: "_id", Value: dir}}).
		SetSkip(offset).SetLimit(limit)

	cur, err := r.col.Find(ctx, filter, opt)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	out := []domain.User{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// sortKey 는 정렬 기준을 Mongo 문서의 필드명으로 옮긴다.
// 도메인 필드명과 bson 태그가 같아 대부분 그대로지만, 매핑을 한곳에 모아 둔다.
func sortKey(f ports.SortField) string {
	switch f {
	case ports.SortName:
		return "user_nm"
	case ports.SortLoginID:
		return "login_id"
	case ports.SortRole:
		return "role_cd"
	case ports.SortStatus:
		return "status_cd"
	}
	return "created_at"
}

// userFilter 는 UserQuery 를 Mongo 필터로 바꾼다.
// 검색어는 반드시 QuoteMeta 로 이스케이프한다 — 그러지 않으면 사용자가 넣은
// 정규식 메타문자가 그대로 실행되어 의도치 않은 매칭이나 ReDoS 를 부른다.
func userFilter(q ports.UserQuery) bson.M {
	and := []bson.M{}
	if s := strings.TrimSpace(q.Search); s != "" {
		rx := bson.M{"$regex": regexp.QuoteMeta(s), "$options": "i"}
		and = append(and, bson.M{"$or": []bson.M{
			{"user_nm": rx}, {"nickname": rx}, {"login_id": rx}, {"email_addr": rx}, {"org_nm": rx},
		}})
	}
	if q.Role != "" {
		if q.Role == string(domain.RoleUser) {
			// 기존 데이터는 role_cd 가 없거나 빈 문자열이다 — 모두 USER 로 본다.
			and = append(and, bson.M{"$or": []bson.M{
				{"role_cd": string(domain.RoleUser)}, {"role_cd": ""}, {"role_cd": bson.M{"$exists": false}},
			}})
		} else {
			and = append(and, bson.M{"role_cd": q.Role})
		}
	}
	if q.Status != "" {
		and = append(and, bson.M{"status_cd": q.Status})
	}
	if q.Membership != "" {
		and = append(and, bson.M{"membership_cd": q.Membership})
	}
	// 조직은 완전 일치(정규식이 아니다) — 공지 대상 지정에 그대로 쓰인다.
	if q.Org != "" {
		and = append(and, bson.M{"org_nm": q.Org})
	}
	if len(and) == 0 {
		return bson.M{}
	}
	return bson.M{"$and": and}
}

func (r *UserRepo) CountByRole(ctx context.Context) (map[string]int64, error) {
	out := map[string]int64{string(domain.RoleUser): 0, string(domain.RoleAdmin): 0}

	admins, err := r.col.CountDocuments(ctx, bson.M{"role_cd": string(domain.RoleAdmin)})
	if err != nil {
		return nil, err
	}
	total, err := r.col.CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out[string(domain.RoleAdmin)] = admins
	out[string(domain.RoleUser)] = total - admins // 관리자가 아닌 나머지는 전부 일반 사용자
	return out, nil
}

func (r *UserRepo) CountCreatedSince(ctx context.Context, since time.Time) (int64, error) {
	return r.col.CountDocuments(ctx, bson.M{"created_at": bson.M{"$gt": since}})
}
