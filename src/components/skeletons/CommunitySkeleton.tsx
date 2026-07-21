import React from 'react';
import { View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonCard } from '../ui/Skeleton';

/** 커뮤니티의 실시간 데이터 카드(라이브·챌린지·랭킹·빌딩)가 도착하기 전 자리를 지키는 스켈레톤. */
export function CommunitySkeleton() {
  return (
    <View>
      {/* 지금 함께 학습 중 */}
      <SkeletonCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
          <Skeleton width="45%" height={15} />
          <Skeleton width={50} height={18} />
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCircle key={i} size={32} style={{ marginLeft: i === 0 ? 0 : -10 }} />
          ))}
        </View>
        <Skeleton width="100%" height={38} radius={12} style={{ marginBottom: 14 }} />
        <Skeleton width="100%" height={8} radius={4} />
      </SkeletonCard>

      {/* 주간 챌린지 */}
      <SkeletonCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
          <Skeleton width="50%" height={14} />
          <Skeleton width={64} height={20} radius={999} />
        </View>
        <Skeleton width="40%" height={20} style={{ marginBottom: 8 }} />
        <Skeleton width="100%" height={10} radius={5} />
      </SkeletonCard>

      {/* 기여 랭킹 */}
      <SkeletonCard>
        <Skeleton width="45%" height={14} style={{ marginBottom: 14 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <Skeleton width={22} height={14} />
            <SkeletonCircle size={26} />
            <View style={{ flex: 1 }}>
              <Skeleton width="40%" height={12} />
              <Skeleton width="100%" height={5} radius={3} style={{ marginTop: 5 }} />
            </View>
          </View>
        ))}
      </SkeletonCard>
    </View>
  );
}
