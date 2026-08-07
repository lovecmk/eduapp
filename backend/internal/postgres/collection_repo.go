package postgres

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// CollectionRepo 는 ports.CollectionRepository 의 PostgreSQL 구현.
//
// 도감(카드 id → 장수)과 규칙 수령 횟수는 JSONB 한 칸에 담는다.
// 카드 500종을 행으로 펼치면 사용자당 최대 500행이 되는데, 이 데이터는 항상
// **통째로 읽고 통째로 쓴다**(부분 조회를 하는 화면이 없다). 그런 접근 패턴에
// 행 분해는 조인 비용만 늘리고 얻는 것이 없다.
type CollectionRepo struct{ pool *pgxpool.Pool }

// NewCollectionRepo 는 도감 어댑터를 만든다.
func NewCollectionRepo(pool *pgxpool.Pool) *CollectionRepo { return &CollectionRepo{pool: pool} }

func (r *CollectionRepo) LoadCollection(ctx context.Context, userID string) (domain.Collection, error) {
	out := domain.NewCollection(userID)
	var ownedRaw, rulesRaw, codesRaw []byte
	err := r.pool.QueryRow(ctx,
		`SELECT owned, packs_earned, packs_opened, shards_earned, shards_spent,
		        study_total, claimed_rules, redeemed_codes, last_daily_pack,
		        since_epic, since_legendary, updated_at
		 FROM user_collection WHERE user_id=$1`, userID).
		Scan(&ownedRaw, &out.PacksEarned, &out.PacksOpened, &out.ShardsEarned, &out.ShardsSpent,
			&out.StudyTotal, &rulesRaw, &codesRaw, &out.LastDailyPack,
			&out.SinceEpic, &out.SinceLegendary, &out.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		// 아직 아무것도 모으지 않았다 — 정상 상태다.
		return out, nil
	}
	if err != nil {
		return domain.NewCollection(userID), err
	}
	// JSON 이 깨져 있어도 도감 전체를 실패로 만들지 않는다. 그 칸만 비우고
	// 나머지(팩·조각 카운터)는 살린다 — 잔액이 사라지는 쪽이 훨씬 아프다.
	_ = json.Unmarshal(ownedRaw, &out.Owned)
	_ = json.Unmarshal(rulesRaw, &out.ClaimedRules)
	_ = json.Unmarshal(codesRaw, &out.RedeemedCodes)
	if out.Owned == nil {
		out.Owned = map[string]int{}
	}
	if out.ClaimedRules == nil {
		out.ClaimedRules = map[string]int{}
	}
	if out.RedeemedCodes == nil {
		out.RedeemedCodes = []string{}
	}
	return out, nil
}

func (r *CollectionRepo) SaveCollection(ctx context.Context, c domain.Collection) error {
	owned, err := json.Marshal(orEmptyMap(c.Owned))
	if err != nil {
		return err
	}
	rules, err := json.Marshal(orEmptyMap(c.ClaimedRules))
	if err != nil {
		return err
	}
	codes, err := json.Marshal(orEmptySlice(c.RedeemedCodes))
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx,
		`INSERT INTO user_collection (user_id, owned, packs_earned, packs_opened,
		     shards_earned, shards_spent, study_total, claimed_rules, redeemed_codes,
		     last_daily_pack, since_epic, since_legendary, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		 ON CONFLICT (user_id) DO UPDATE SET
		   owned=EXCLUDED.owned, packs_earned=EXCLUDED.packs_earned,
		   packs_opened=EXCLUDED.packs_opened, shards_earned=EXCLUDED.shards_earned,
		   shards_spent=EXCLUDED.shards_spent, study_total=EXCLUDED.study_total,
		   claimed_rules=EXCLUDED.claimed_rules, redeemed_codes=EXCLUDED.redeemed_codes,
		   last_daily_pack=EXCLUDED.last_daily_pack, since_epic=EXCLUDED.since_epic,
		   since_legendary=EXCLUDED.since_legendary, updated_at=EXCLUDED.updated_at`,
		c.UserID, owned, c.PacksEarned, c.PacksOpened, c.ShardsEarned, c.ShardsSpent,
		c.StudyTotal, rules, codes, c.LastDailyPack, c.SinceEpic, c.SinceLegendary, c.UpdatedAt)
	return err
}

func orEmptyMap(m map[string]int) map[string]int {
	if m == nil {
		return map[string]int{}
	}
	return m
}

func orEmptySlice(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

var _ ports.CollectionRepository = (*CollectionRepo)(nil)
