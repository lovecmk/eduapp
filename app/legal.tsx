import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, LayoutAnimation, UIManager } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Switch } from '../src/components/ui/Switch';
import { SettingsFocusProvider, FocusAnchor, MeasureOffset } from '../src/components/settings/SettingsFocus';
import { useSettingsStore } from '../src/store/settingsStore';
import { fontCute, fontBody, fontMono } from '../src/theme/tokens';
import { env } from '../src/data/network/env';
import { APP_NAME } from '../src/constants/brand';
import {
  LEGAL_SECTIONS,
  LEGAL_META,
  OPEN_SOURCE_LIBRARIES,
  MIT_LICENSE_TEXT,
  type LegalBlock,
} from '../src/constants/legal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * 약관 · 법적 고지 — 설정 최하단에서 진입하는 단일 화면.
 *
 * 법적으로 고지해야 하는 항목(약관·개인정보 처리방침·접근권한·수신동의·오픈소스·저작권 등)을
 * 화면을 더 파고들지 않고 한 곳에서 모두 볼 수 있도록 아코디언으로 묶었다.
 * 덕분에 설정의 depth 는 얕게 유지되면서도(설정 → 여기까지 2단계) 고지 의무는 빠짐없이 이행된다.
 *
 * 설정 검색에서 특정 조항으로 들어오면(`?focus=<id>`) 해당 절이 자동으로 펼쳐지고
 * 그 위치까지 스크롤·하이라이트된다.
 */
export default function LegalScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusId = typeof params.focus === 'string' ? params.focus : null;
  const scrollRef = useRef<ScrollView>(null);

  // 검색으로 들어온 절은 미리 펼쳐 둔다(들어오자마자 읽을 수 있게).
  const [open, setOpen] = useState<Record<string, boolean>>(() => (focusId ? { [focusId]: true } : {}));
  const [ossOpen, setOssOpen] = useState(focusId === 'opensource');
  const [licenseOpen, setLicenseOpen] = useState(false);

  const marketing = useSettingsStore((s) => s.notifications.marketing);
  const updateNotification = useSettingsStore((s) => s.updateNotificationSetting);

  useEffect(() => {
    if (focusId) {
      setOpen((prev) => ({ ...prev, [focusId]: true }));
      if (focusId === 'opensource') setOssOpen(true);
    }
  }, [focusId]);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="약관 · 법적 고지" />
      <SettingsFocusProvider scrollRef={scrollRef} initialFocusId={focusId} offset={24}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 56 }}
          showsVerticalScrollIndicator={false}
        >
          <MeasureOffset>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, lineHeight: 19 * fs, fontFamily: fontBody, marginBottom: 14 }}>
              {APP_NAME}은(는) {LEGAL_META.operator}의 사내 학습 서비스입니다. 아래 항목을 눌러 전문을 확인할 수 있어요.
            </Text>

            {LEGAL_SECTIONS.map((section) => (
              <FocusAnchor key={section.id} id={section.id}>
                <View style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, marginBottom: 10, overflow: 'hidden' }}>
                  <Pressable
                    onPress={() => toggle(section.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !!open[section.id] }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14,
                      backgroundColor: pressed ? c.surfaceAlt : 'transparent',
                    })}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={section.icon} size={16} color={c.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>
                        {section.title}
                      </Text>
                      <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 2 }}>
                        {section.summary}
                      </Text>
                    </View>
                    <Ionicons name={open[section.id] ? 'chevron-up' : 'chevron-down'} size={17} color={c.textSecondary} />
                  </Pressable>

                  {open[section.id] && (
                    <View style={{ paddingHorizontal: 15, paddingBottom: 16, gap: 9 }}>
                      <View style={{ height: 1, backgroundColor: c.border, marginBottom: 3 }} />
                      {section.blocks.map((block, i) => (
                        <Block key={i} block={block} />
                      ))}

                      {/* 수신 동의 절에는 실제로 끄고 켤 수 있는 스위치를 함께 둔다.
                          '고지'만 하고 철회 수단이 다른 화면에 있으면 사용자가 길을 잃는다. */}
                      {section.id === 'consent-marketing' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 13, marginTop: 4 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, fontWeight: '700', fontFamily: fontCute }}>
                              혜택 · 이벤트 정보 받기
                            </Text>
                            <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 2 }}>
                              {marketing ? '동의함 — 언제든 끌 수 있어요' : '동의하지 않음'}
                            </Text>
                          </View>
                          <Switch label="혜택 · 이벤트 정보 받기" value={marketing} onValueChange={(v) => updateNotification('marketing', v)} />
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </FocusAnchor>
            ))}

            {/* 오픈소스 라이선스 — 목록이 길어 별도 아코디언으로 둔다. */}
            <FocusAnchor id="opensource">
              <View style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, marginBottom: 10, overflow: 'hidden' }}>
                <Pressable
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setOssOpen((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: ossOpen }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14,
                    backgroundColor: pressed ? c.surfaceAlt : 'transparent',
                  })}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="code-slash-outline" size={16} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>
                      오픈소스 라이선스
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 2 }}>
                      사용 중인 오픈소스 {OPEN_SOURCE_LIBRARIES.length}종 고지
                    </Text>
                  </View>
                  <Ionicons name={ossOpen ? 'chevron-up' : 'chevron-down'} size={17} color={c.textSecondary} />
                </Pressable>

                {ossOpen && (
                  <View style={{ paddingHorizontal: 15, paddingBottom: 16 }}>
                    <View style={{ height: 1, backgroundColor: c.border, marginBottom: 10 }} />
                    <Text style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 18 * fs, fontFamily: fontBody, marginBottom: 10 }}>
                      이 앱은 아래 오픈소스 소프트웨어를 사용하며, 각 라이선스의 고지 의무에 따라 저작권 표시와 라이선스 전문을 안내합니다.
                    </Text>
                    {OPEN_SOURCE_LIBRARIES.map((lib) => (
                      <View key={lib.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, gap: 10 }}>
                        <Text style={{ color: c.textPrimary, fontSize: 12 * fs, fontFamily: fontMono, flex: 1 }} numberOfLines={1}>
                          {lib.name}
                          <Text style={{ color: c.textSecondary }}>{lib.version === '—' ? '' : ` ${lib.version}`}</Text>
                        </Text>
                        <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontMono }}>{lib.license}</Text>
                      </View>
                    ))}

                    <Pressable
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setLicenseOpen((v) => !v);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}
                    >
                      <Ionicons name={licenseOpen ? 'remove-circle-outline' : 'add-circle-outline'} size={15} color={c.primary} />
                      <Text style={{ color: c.primary, fontSize: 12.5 * fs, fontWeight: '700', fontFamily: fontCute }}>
                        MIT 라이선스 전문 {licenseOpen ? '접기' : '보기'}
                      </Text>
                    </Pressable>
                    {licenseOpen && (
                      <Text style={{ color: c.textSecondary, fontSize: 11 * fs, lineHeight: 17 * fs, fontFamily: fontMono, marginTop: 8 }}>
                        {MIT_LICENSE_TEXT}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </FocusAnchor>

            <View style={{ alignItems: 'center', marginTop: 18, gap: 4 }}>
              <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, textAlign: 'center', lineHeight: 17 * fs }}>
                시행일 {LEGAL_META.effectiveAt} · 최종 개정일 {LEGAL_META.revisedAt}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontMono, opacity: 0.75 }}>
                {APP_NAME} v{env.build.version} · build {env.build.buildNumber}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontBody, opacity: 0.75, textAlign: 'center' }}>
                © {LEGAL_META.operator}. All rights reserved.
              </Text>
            </View>
          </MeasureOffset>
        </ScrollView>
      </SettingsFocusProvider>
    </View>
  );
}

/** 고지 본문 한 덩어리 — 문단 / 불릿 / 표 / 강조 노트. */
function Block({ block }: { block: LegalBlock }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;

  if (block.kind === 'p') {
    return (
      <Text style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 21 * fs, fontFamily: fontBody }}>
        {block.text}
      </Text>
    );
  }

  if (block.kind === 'bullets') {
    return (
      <View style={{ gap: 5 }}>
        {block.items.map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 7 }}>
            <Text style={{ color: c.primary, fontSize: 13 * fs, lineHeight: 20 * fs }}>·</Text>
            <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, lineHeight: 20 * fs, fontFamily: fontBody, flex: 1 }}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (block.kind === 'rows') {
    return (
      <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, gap: 9 }}>
        {block.rows.map((row, i) => (
          <View key={i} style={{ gap: 2 }}>
            <Text style={{ color: c.textPrimary, fontSize: 12 * fs, fontWeight: '700', fontFamily: fontCute }}>
              {row.k}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 18 * fs, fontFamily: fontBody }}>
              {row.v}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: 8, backgroundColor: c.primary + '10', borderRadius: 12, padding: 11 }}>
      <Ionicons name="information-circle-outline" size={15} color={c.primary} style={{ marginTop: 1 }} />
      <Text style={{ color: c.textPrimary, fontSize: 12 * fs, lineHeight: 18 * fs, fontFamily: fontBody, flex: 1 }}>
        {block.text}
      </Text>
    </View>
  );
}
