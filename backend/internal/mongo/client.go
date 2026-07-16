// Package mongo 는 ports 인터페이스의 MongoDB 구현(어댑터)이다.
package mongo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Connect 는 MongoDB 에 연결하고 ping 으로 가용성을 확인한다.
func Connect(ctx context.Context, uri, dbName string) (*mongo.Database, func(context.Context) error, error) {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(cctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, nil, err
	}
	if err := client.Ping(cctx, nil); err != nil {
		return nil, nil, err
	}
	return client.Database(dbName), client.Disconnect, nil
}
