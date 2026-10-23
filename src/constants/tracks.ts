// Course appearance only. Available courses and their cards come from the API.
export const TRACK_GROUP_LABELS: Record<string, string> = {
  RISK: '위험요인', MEASURE: '방호요인', DAILY3MIN: '하루3분ON',
};

export const TRACK_APPEARANCE: Record<string, { icon: string; color: string }> = {
  ELEC: { icon: 'flash', color: '#F2B705' },
  HOTWORK: { icon: 'flame', color: '#E2574C' },
  HAZMAT: { icon: 'flask', color: '#E2574C' },
  GAS: { icon: 'cloud', color: '#5C6BC0' },
  PROCESS: { icon: 'construct', color: '#5C6BC0' },
  SAFEMGMT: { icon: 'shield-checkmark', color: '#26A69A' },
  SPREAD: { icon: 'layers', color: '#26A69A' },
  EGRESS: { icon: 'exit', color: '#26A69A' },
  SMOKE: { icon: 'cloud', color: '#0EA5E9' },
  EXTING: { icon: 'flame', color: '#E2574C' },
  WATEREXT: { icon: 'water', color: '#0EA5E9' },
  GASEXT: { icon: 'cloud', color: '#5C6BC0' },
  ALARM: { icon: 'notifications', color: '#F2B705' },
  FIREACT: { icon: 'shield-checkmark', color: '#0EA5E9' },
  RISK_MGMT: { icon: 'shield-checkmark', color: '#26A69A' },
  LANGUAGE: { icon: 'language', color: '#5C6BC0' },
  WORK: { icon: 'briefcase', color: '#26A69A' },
};
