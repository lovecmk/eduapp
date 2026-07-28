package mongo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// MongoDB 분석 읽기 — ports.InsightRepository 구현.
//
// 집계는 $group 파이프라인으로 서버에서 끝낸다. Find 로 전부 끌어와 Go 에서
// 합치면 데이터가 늘수록 네트워크로 다 실어 나르게 된다.

// masteredBox 는 '충분히 익혔다'고 보는 기억 상자 기준(앱의 간격반복과 같은 값).
const masteredBox = 4

// maxUserDayRows 는 ActiveUserDays 가 한 번에 돌려주는 최대 행 수.
// 여기만 집계가 아니라 원재료를 주기 때문에 상한을 둔다.
const maxUserDayRows = 500_000

func (r *UserDataRepo) CardLearning(ctx context.Context) ([]ports.CardLearningStat, error) {
	cur, err := r.srs.Aggregate(ctx, []bson.M{
		{"$group": bson.M{
			"_id":      "$card_id",
			"learners": bson.M{"$sum": 1},
			"reps":     bson.M{"$sum": "$reps"},
			"lapses":   bson.M{"$sum": "$lapses"},
			"avg_ease": bson.M{"$avg": "$ease"},
			"avg_box":  bson.M{"$avg": "$box"},
			// 조건부 합계로 '상자 4 이상'만 센다.
			"mastered": bson.M{"$sum": bson.M{
				"$cond": []any{bson.M{"$gte": []any{"$box", masteredBox}}, 1, 0},
			}},
		}},
		// 정렬하지 않으면 같은 데이터로 두 번 물었을 때 순서가 뒤바뀐다.
		{"$sort": bson.M{"_id": 1}},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var raw []struct {
		CardID   string  `bson:"_id"`
		Learners int64   `bson:"learners"`
		Reps     int64   `bson:"reps"`
		Lapses   int64   `bson:"lapses"`
		AvgEase  float64 `bson:"avg_ease"`
		AvgBox   float64 `bson:"avg_box"`
		Mastered int64   `bson:"mastered"`
	}
	if err := cur.All(ctx, &raw); err != nil {
		return nil, err
	}

	out := make([]ports.CardLearningStat, 0, len(raw))
	for _, x := range raw {
		out = append(out, ports.CardLearningStat{
			CardID: x.CardID, Learners: x.Learners, Reps: x.Reps, Lapses: x.Lapses,
			AvgEase: x.AvgEase, AvgBox: x.AvgBox, Mastered: x.Mastered,
		})
	}
	return out, nil
}

func (r *UserDataRepo) LearnerLearning(ctx context.Context) ([]ports.LearnerStat, error) {
	cur, err := r.srs.Aggregate(ctx, []bson.M{
		{"$group": bson.M{
			"_id":       "$user_id",
			"cards":     bson.M{"$sum": 1},
			"reps":      bson.M{"$sum": "$reps"},
			"lapses":    bson.M{"$sum": "$lapses"},
			"avg_box":   bson.M{"$avg": "$box"},
			"last_seen": bson.M{"$max": "$last_reviewed_at"},
		}},
		{"$sort": bson.M{"_id": 1}},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	// LastSeen 은 한 번도 복습하지 않은 사용자에게 null 이라 포인터로 받는다.
	// time.Time 으로 직접 받으면 디코딩이 깨진다.
	var raw []struct {
		UserID   string     `bson:"_id"`
		Cards    int64      `bson:"cards"`
		Reps     int64      `bson:"reps"`
		Lapses   int64      `bson:"lapses"`
		AvgBox   float64    `bson:"avg_box"`
		LastSeen *time.Time `bson:"last_seen"`
	}
	if err := cur.All(ctx, &raw); err != nil {
		return nil, err
	}

	out := make([]ports.LearnerStat, 0, len(raw))
	for _, x := range raw {
		s := ports.LearnerStat{
			UserID: x.UserID, Cards: x.Cards, Reps: x.Reps,
			Lapses: x.Lapses, AvgBox: x.AvgBox,
		}
		if x.LastSeen != nil {
			s.LastSeen = *x.LastSeen
		}
		out = append(out, s)
	}
	return out, nil
}

func (r *UserDataRepo) ActiveUserDays(ctx context.Context) ([]ports.UserDay, error) {
	// learn_history 는 (user, day, card) 한 줄씩이라 하루 5장이면 5줄이다.
	// 여기서 필요한 것은 '그날 활동했다'는 사실뿐이므로 $group 으로 접는다.
	cur, err := r.history.Aggregate(ctx, []bson.M{
		{"$group": bson.M{"_id": bson.M{"user_id": "$user_id", "day_key": "$day_key"}}},
		{"$sort": bson.M{"_id.user_id": 1, "_id.day_key": 1}},
		{"$limit": maxUserDayRows},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var raw []struct {
		ID struct {
			UserID string `bson:"user_id"`
			DayKey string `bson:"day_key"`
		} `bson:"_id"`
	}
	if err := cur.All(ctx, &raw); err != nil {
		return nil, err
	}

	out := make([]ports.UserDay, 0, len(raw))
	for _, x := range raw {
		out = append(out, ports.UserDay{UserID: x.ID.UserID, DayKey: x.ID.DayKey})
	}
	return out, nil
}
