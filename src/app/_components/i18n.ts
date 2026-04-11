"use client";

import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import zh from "@/locales/radar/zh.json";
import zhCN from "@/locales/radar/zh-CN.json";

export const languageOptions = [
  { value: "zh-CN", label: "中文", flag: "CN" },
  { value: "ko", label: "한국어", flag: "KR" },
  { value: "ja", label: "日本語", flag: "JP" },
  { value: "ko-KP", label: "조선어", flag: "KP" },
  { value: "th", label: "ไทย", flag: "TH" },
  { value: "en-US", label: "English (US)", flag: "US" },
  { value: "en-GB", label: "English (UK)", flag: "GB" },
  { value: "fr", label: "Français", flag: "FR" },
] as const;

const enUS = {
  chrome: {
    title: "Yantai Manufacturing Radar",
    badge: "Yantai Signal Room",
    heroTitle: "Manufacturing Sales Radar, Yantai First",
    heroSubtitle:
      "Paired with a city-based competitor map so you can see who is chasing the same customers.",
    heroDescription:
      "This page is not a pile of news. It puts leads, competitors, follow-up actions, and evidence gaps into one panel so you can judge first and act second.",
    currentFocus: "Current Focus",
    todayStatus: "Today Status",
  },
  topbar: {
    locating: "Locating...",
    weatherLoading: "Loading weather...",
    locationDenied: "Location denied",
    weatherUnavailable: "Weather unavailable",
    language: "Language",
    defaultLocation: "Yantai ETDZ",
  },
  metrics: {
    highPriority: "Priority Leads",
    highPriorityDetail: "Items worth immediate follow-up today.",
    potentialLeads: "Potential Leads",
    potentialLeadsDetail: "Keep early signals visible for continued follow-up.",
    competitors: "Competitors",
    competitorsDetail: "Counts competitor samples within the current city range.",
    nextActions: "Next Actions",
    nextActionsDetail: "Converted into the next execution list.",
  },
  map: {
    title: "City Competitor Map",
    competitorMap: "Competitor Map",
    loading: "Loading base map...",
    noCoordinates: "No competitor coordinates yet. Showing the base map first.",
    linkedTo: "Linked to {{name}}. The card below is expanded. Current path: {{path}}.",
    noData: "No mappable competitor data yet. The base map remains available.",
    baselineMarker: "Baseline",
    competitorTooltip: "{{name}} · {{city}} · {{fit}}",
    updatedAt: "Updated: {{value}}",
  },
  deck: {
    eyebrow: "Competitor Deck",
    title: "Manufacturing Service Competitor Cards",
    description:
      "The map gives spatial context. The cards give detail. Cards stay collapsed until you expand them or click a point.",
    baseline: "Baseline",
    allCities: "All Cities",
    serviceFit: "Fit {{fit}}",
    fitLevels: {
      high: "High",
      medium: "Medium",
      low: "Low",
    },
    manufacturingFocus: "Manufacturing Focus",
    evidenceStrength: "Evidence Strength",
    evidence: "Evidence",
    emptyFiltered: "No competitor companies have been synced for the current selection.",
  },
  cityFilter: {
    label: "City Scope",
    placeholder: "Select a city or district",
    selected: "Selected Areas",
    empty: "No area has been added yet. All competitor data is shown by default.",
    validation: "Check at least one city or district before adding.",
    duplicate: "The selected areas have already been added.",
    partialDuplicate: "New areas were added. {{count}} items already existed.",
    checkedSummary: "{{count}} item(s) checked",
    addAction: "Add areas",
    removeAction: "Remove {{city}}",
    allCities: "All Cities",
    syncedStatus: "{{count}} manufacturing-service competitors synced.",
    filteredStatus: "{{count}} manufacturing-service competitors in the current scope.",
    defaultNote:
      "Use the city selector above to expand or narrow the competitor scope. The map and cards refresh together.",
    filteredNote: "The map and cards are now filtered to the selected areas.",
  },
  sections: {
    priorityEyebrow: "Priority Leads",
    priorityTitle: "High-Priority Leads Today",
    priorityDescription:
      "Show the highest-value targets with timing, entity, region, and action evidence.",
    pipelineEyebrow: "Pipeline",
    pipelineTitle: "Next Follow-Up Actions",
    pipelineDescription: "Turn the daily report into actions instead of stopping at a summary.",
    potentialEyebrow: "Potential Accounts",
    potentialTitle: "Potential Account Signals",
    potentialDescription:
      "This area keeps earlier signals with stage, confidence, and handling advice.",
    watchlistEyebrow: "Watchlist",
    watchlistTitle: "Key Accounts / Competitor Moves",
    watchlistDescription:
      "Suitable for major Shandong manufacturers, integrators, customer cases, and activity changes.",
    gapsEyebrow: "Coverage Gaps",
    gapsTitle: "Not Covered / Insufficient Evidence Today",
    gapsDescription: "Keep unfinished cities, themes, and entities visible for the next round.",
    accountsEyebrow: "Account Deck",
    accountsTitle: "Targets Worth Adding to the Account List",
    accountsDescription: "Turn report-worthy companies, parks, and vendors into long-term assets.",
  },
  entry: {
    source: "Source",
    publishedAt: "Published",
  },
  empty: {
    priority: "No sufficiently strong high-priority leads have been synced yet.",
    pipeline: "No follow-up actions have been written today.",
    potential: "No new potential account signals have been synced today.",
    watchlist: "No new key-account or competitor activity today.",
    gaps: "No extra gaps or insufficient-evidence items today.",
    accounts: "No new suggested account targets today.",
  },
};

const ko = {
  chrome: {
    title: "옌타이 제조 영업 레이더",
    badge: "옌타이 시그널 룸",
    heroTitle: "옌타이 우선 제조 영업 레이더",
    heroSubtitle:
      "도시 기반 경쟁사 지도를 함께 보여 주어 같은 고객을 노리는 회사를 확인할 수 있습니다.",
    heroDescription:
      "이 페이지는 뉴스 모음이 아니라 리드, 경쟁사, 후속 조치, 증거 공백을 한 화면에 모아 먼저 판단하고 나중에 행동하게 합니다.",
    currentFocus: "현재 초점",
    todayStatus: "오늘 상태",
  },
  topbar: {
    locating: "위치 확인 중...",
    weatherLoading: "날씨 불러오는 중...",
    locationDenied: "위치 권한 없음",
    weatherUnavailable: "날씨 정보 없음",
    language: "언어",
    defaultLocation: "옌타이 개발구",
  },
  metrics: {
    highPriority: "핵심 리드",
    highPriorityDetail: "오늘 바로 추적할 가치가 있는 대상 수입니다.",
    potentialLeads: "잠재 리드",
    potentialLeadsDetail: "초기 신호를 계속 보이게 유지합니다.",
    competitors: "경쟁사",
    competitorsDetail: "현재 선택된 도시 범위의 표본을 집계합니다.",
    nextActions: "다음 액션",
    nextActionsDetail: "실행 목록으로 전환되었습니다.",
  },
  map: {
    title: "도시 경쟁사 분포",
    competitorMap: "경쟁사 지도",
    loading: "지도 베이스를 불러오는 중...",
    noCoordinates: "좌표 데이터가 없어도 지도를 먼저 표시합니다.",
    linkedTo: "{{name}}와 연결되었습니다. 아래 카드가 펼쳐졌고 현재 경로는 {{path}} 입니다.",
    noData: "표시할 경쟁사 데이터가 아직 없습니다.",
    baselineMarker: "기준 회사",
    competitorTooltip: "{{name}} · {{city}} · {{fit}}",
    updatedAt: "업데이트 시간: {{value}}",
  },
  deck: {
    eyebrow: "경쟁사 카드",
    title: "제조 서비스 경쟁사 카드",
    description: "지도는 공간감을 주고 카드가 세부 내용을 보여 줍니다.",
    baseline: "기준 회사",
    allCities: "전체 도시",
    serviceFit: "적합도 {{fit}}",
    fitLevels: {
      high: "높음",
      medium: "보통",
      low: "낮음",
    },
    manufacturingFocus: "제조업 초점",
    evidenceStrength: "증거 강도",
    evidence: "증거",
    emptyFiltered: "현재 선택 범위에는 동기화된 경쟁사 회사가 없습니다.",
  },
  cityFilter: {
    label: "도시 범위",
    placeholder: "도시 또는 구/현을 선택하세요",
    selected: "선택한 지역",
    empty: "아직 추가된 지역이 없습니다. 기본적으로 전체 경쟁사 데이터를 표시합니다.",
    validation: "추가하기 전에 도시 또는 구/현을 하나 이상 체크하세요.",
    duplicate: "선택한 지역은 이미 추가되었습니다.",
    partialDuplicate: "새 지역은 추가되었고 {{count}}개는 이미 존재했습니다.",
    checkedSummary: "{{count}}개 선택됨",
    addAction: "지역 추가",
    removeAction: "{{city}} 제거",
    allCities: "전체 도시",
    syncedStatus: "{{count}}개의 제조 서비스 경쟁사가 동기화되었습니다.",
    filteredStatus: "현재 범위 내 제조 서비스 경쟁사 {{count}}개",
    defaultNote:
      "위의 도시 선택기로 경쟁사 범위를 넓히거나 좁힐 수 있습니다. 지도와 카드가 함께 갱신됩니다.",
    filteredNote: "지도와 카드가 선택한 지역 범위로 필터링되었습니다.",
  },
  sections: enUS.sections,
  entry: {
    source: "출처",
    publishedAt: "게시일",
  },
  empty: {
    priority: "오늘 동기화된 핵심 리드가 아직 없습니다.",
    pipeline: "오늘 작성된 후속 조치가 없습니다.",
    potential: "오늘 새로운 잠재 고객 신호가 없습니다.",
    watchlist: "오늘 새로운 주요 기업 또는 경쟁사 동향이 없습니다.",
    gaps: "오늘 추가 미커버 항목이 없습니다.",
    accounts: "오늘 새로 추가할 추천 계정이 없습니다.",
  },
};

const ja = {
  chrome: {
    title: "煙台優先営業レーダー",
    badge: "煙台シグナルルーム",
    heroTitle: "煙台優先の製造業営業レーダー",
    heroSubtitle: "都市ベースの競合マップも合わせて表示し、同じ顧客を狙う会社を確認できます。",
    heroDescription:
      "このページはニュースの寄せ集めではなく、リード、競合、次の行動、証拠不足を一つの画面にまとめています。",
    currentFocus: "現在の焦点",
    todayStatus: "本日の状態",
  },
  topbar: {
    locating: "位置を取得中...",
    weatherLoading: "天気を取得中...",
    locationDenied: "位置情報が拒否されました",
    weatherUnavailable: "天気情報なし",
    language: "言語",
    defaultLocation: "煙台開発区",
  },
  metrics: {
    highPriority: "優先リード",
    highPriorityDetail: "今日すぐ追うべき対象数です。",
    potentialLeads: "潜在リード",
    potentialLeadsDetail: "初期シグナルを継続追跡できます。",
    competitors: "競合企業",
    competitorsDetail: "現在の都市範囲内の競合サンプルを集計します。",
    nextActions: "次の行動",
    nextActionsDetail: "実行リストへ変換済みです。",
  },
  map: {
    title: "都市別競合分布",
    competitorMap: "競合マップ",
    loading: "地図を読み込み中...",
    noCoordinates: "座標がなくても先に地図を表示します。",
    linkedTo: "{{name}} に連動しました。下のカードを展開し、現在の経路は {{path}} です。",
    noData: "まだ配置できる競合データがありません。",
    baselineMarker: "基準企業",
    competitorTooltip: "{{name}} · {{city}} · {{fit}}",
    updatedAt: "更新時刻: {{value}}",
  },
  deck: {
    eyebrow: "競合カード",
    title: "製造サービス競合カード",
    description: "マップは位置関係、カードは詳細を担当します。",
    baseline: "基準企業",
    allCities: "全都市",
    serviceFit: "適合度 {{fit}}",
    fitLevels: {
      high: "高",
      medium: "中",
      low: "低",
    },
    manufacturingFocus: "製造業フォーカス",
    evidenceStrength: "証拠強度",
    evidence: "証拠",
    emptyFiltered: "現在の選択範囲には同期済みの競合企業がありません。",
  },
  cityFilter: {
    label: "都市範囲",
    placeholder: "市または区県を選択",
    selected: "選択済みエリア",
    empty: "まだエリアが追加されていません。初期状態では全競合データを表示します。",
    validation: "追加する前に市または区県を1つ以上チェックしてください。",
    duplicate: "選択したエリアはすでに追加されています。",
    partialDuplicate: "新しいエリアを追加しました。{{count}} 件は既存でした。",
    checkedSummary: "{{count}} 件選択中",
    addAction: "エリア追加",
    removeAction: "{{city}} を削除",
    allCities: "全都市",
    syncedStatus: "製造サービス競合 {{count}} 社を同期済みです。",
    filteredStatus: "現在の範囲内に製造サービス競合 {{count}} 社",
    defaultNote:
      "上の都市セレクターで競合範囲を広げたり絞ったりできます。マップとカードは同時に更新されます。",
    filteredNote: "マップとカードは選択したエリアに絞り込まれています。",
  },
  sections: enUS.sections,
  entry: {
    source: "出典",
    publishedAt: "公開日",
  },
  empty: {
    priority: "本日はまだ強い優先リードが同期されていません。",
    pipeline: "本日の次アクションはまだありません。",
    potential: "本日の潜在顧客シグナルはまだありません。",
    watchlist: "本日の重点企業や競合動向はまだありません。",
    gaps: "本日の追加ギャップはありません。",
    accounts: "本日の追加候補はまだありません。",
  },
};

const th = {
  chrome: {
    title: "เรดาร์การขายฝั่งเยียนไถ",
    badge: "ห้องสัญญาณเยียนไถ",
    heroTitle: "เรดาร์การขายอุตสาหกรรมการผลิต เน้นเยียนไถ",
    heroSubtitle: "พร้อมแผนที่คู่แข่งตามเมือง เพื่อดูว่าใครกำลังแย่งลูกค้าเดียวกัน",
    heroDescription:
      "หน้านี้ไม่ใช่กองข่าว แต่รวมลีด คู่แข่ง งานติดตาม และช่องว่างของหลักฐานไว้ในแผงเดียว",
    currentFocus: "โฟกัสปัจจุบัน",
    todayStatus: "สถานะวันนี้",
  },
  topbar: {
    locating: "กำลังระบุตำแหน่ง...",
    weatherLoading: "กำลังโหลดอากาศ...",
    locationDenied: "ไม่มีสิทธิ์ตำแหน่ง",
    weatherUnavailable: "ไม่มีข้อมูลอากาศ",
    language: "ภาษา",
    defaultLocation: "เขตพัฒนาเยียนไถ",
  },
  metrics: {
    highPriority: "ลีดสำคัญ",
    highPriorityDetail: "จำนวนเป้าหมายที่ควรติดตามทันทีวันนี้",
    potentialLeads: "ลีดศักยภาพ",
    potentialLeadsDetail: "เก็บสัญญาณระยะต้นไว้ให้ติดตามต่อ",
    competitors: "คู่แข่ง",
    competitorsDetail: "นับตัวอย่างคู่แข่งภายในขอบเขตเมืองที่เลือกอยู่ตอนนี้",
    nextActions: "การกระทำถัดไป",
    nextActionsDetail: "แปลงเป็นรายการดำเนินการแล้ว",
  },
  map: {
    title: "แผนที่คู่แข่งตามเมือง",
    competitorMap: "แผนที่คู่แข่ง",
    loading: "กำลังโหลดแผนที่...",
    noCoordinates: "ยังไม่มีพิกัดคู่แข่ง แสดงแผนที่ก่อน",
    linkedTo: "เชื่อมกับ {{name}} แล้ว การ์ดด้านล่างเปิดอยู่ เส้นทางปัจจุบันคือ {{path}}",
    noData: "ยังไม่มีข้อมูลคู่แข่งที่ปักหมุดได้",
    baselineMarker: "บริษัทอ้างอิง",
    competitorTooltip: "{{name}} · {{city}} · {{fit}}",
    updatedAt: "อัปเดตเมื่อ: {{value}}",
  },
  deck: {
    eyebrow: "การ์ดคู่แข่ง",
    title: "การ์ดคู่แข่งบริการด้านการผลิต",
    description: "แผนที่ให้ภาพตำแหน่ง การ์ดให้รายละเอียด",
    baseline: "บริษัทอ้างอิง",
    allCities: "ทุกเมือง",
    serviceFit: "ความตรงกลุ่ม {{fit}}",
    fitLevels: {
      high: "สูง",
      medium: "กลาง",
      low: "ต่ำ",
    },
    manufacturingFocus: "โฟกัสการผลิต",
    evidenceStrength: "ความแรงของหลักฐาน",
    evidence: "หลักฐาน",
    emptyFiltered: "ยังไม่มีบริษัทคู่แข่งที่ซิงก์เข้ามาภายใต้ขอบเขตที่เลือก",
  },
  cityFilter: {
    label: "ขอบเขตเมือง",
    placeholder: "เลือกเมืองหรือเขต/อำเภอ",
    selected: "พื้นที่ที่เลือก",
    empty: "ยังไม่ได้เพิ่มพื้นที่ ระบบจะแสดงข้อมูลคู่แข่งทั้งหมดตามค่าเริ่มต้น",
    validation: "กรุณาเลือกเมืองหรือเขต/อำเภออย่างน้อยหนึ่งรายการก่อนเพิ่ม",
    duplicate: "พื้นที่ที่เลือกถูกเพิ่มไว้แล้ว",
    partialDuplicate: "เพิ่มพื้นที่ใหม่แล้ว และมี {{count}} รายการที่มีอยู่แล้ว",
    checkedSummary: "เลือกแล้ว {{count}} รายการ",
    addAction: "เพิ่มพื้นที่",
    removeAction: "ลบ {{city}}",
    allCities: "ทุกเมือง",
    syncedStatus: "ซิงก์คู่แข่งบริการด้านการผลิตแล้ว {{count}} ราย",
    filteredStatus: "มีคู่แข่งบริการด้านการผลิต {{count}} รายในขอบเขตปัจจุบัน",
    defaultNote:
      "ใช้ตัวเลือกเมืองด้านบนเพื่อขยายหรือจำกัดขอบเขตคู่แข่ง แผนที่และการ์ดจะอัปเดตพร้อมกัน",
    filteredNote: "แผนที่และการ์ดถูกกรองตามพื้นที่ที่เลือกแล้ว",
  },
  sections: enUS.sections,
  entry: {
    source: "แหล่งที่มา",
    publishedAt: "วันที่เผยแพร่",
  },
  empty: {
    priority: "วันนี้ยังไม่มีลีดสำคัญที่ซิงก์เข้ามา",
    pipeline: "วันนี้ยังไม่มีรายการติดตาม",
    potential: "วันนี้ยังไม่มีสัญญาณลูกค้าศักยภาพใหม่",
    watchlist: "วันนี้ยังไม่มีความเคลื่อนไหวใหม่ของคู่แข่ง",
    gaps: "วันนี้ยังไม่มีช่องว่างเพิ่มเติม",
    accounts: "วันนี้ยังไม่มีเป้าหมายที่แนะนำให้เพิ่ม",
  },
};

const fr = {
  chrome: {
    title: "Radar commercial Yantai",
    badge: "Signal Room Yantai",
    heroTitle: "Radar commercial industrie, priorité à Yantai",
    heroSubtitle: "Avec une carte des concurrents par ville pour voir qui vise les mêmes clients.",
    heroDescription:
      "Cette page n'est pas un empilement d'actualités. Elle réunit leads, concurrents, actions et manques de preuve dans un seul panneau.",
    currentFocus: "Focus actuel",
    todayStatus: "Statut du jour",
  },
  topbar: {
    locating: "Localisation...",
    weatherLoading: "Chargement météo...",
    locationDenied: "Localisation refusée",
    weatherUnavailable: "Météo indisponible",
    language: "Langue",
    defaultLocation: "Zone ETDZ de Yantai",
  },
  metrics: {
    highPriority: "Leads prioritaires",
    highPriorityDetail: "Cibles à suivre immédiatement aujourd'hui.",
    potentialLeads: "Leads potentiels",
    potentialLeadsDetail: "Conserver les signaux précoces pour un suivi continu.",
    competitors: "Concurrents",
    competitorsDetail: "Compte les échantillons concurrents dans le périmètre urbain actuel.",
    nextActions: "Actions suivantes",
    nextActionsDetail: "Déjà transformées en liste d'exécution.",
  },
  map: {
    title: "Carte des concurrents par ville",
    competitorMap: "Carte concurrentielle",
    loading: "Chargement de la carte...",
    noCoordinates: "Pas encore de coordonnées concurrentes. La carte de base reste visible.",
    linkedTo:
      "Lié à {{name}}. La carte détaillée ci-dessous est ouverte. Chemin actuel : {{path}}.",
    noData: "Aucune donnée concurrentielle cartographiable pour le moment.",
    baselineMarker: "Référence",
    competitorTooltip: "{{name}} · {{city}} · {{fit}}",
    updatedAt: "Mis à jour : {{value}}",
  },
  deck: {
    eyebrow: "Cartes concurrents",
    title: "Cartes des concurrents services industriels",
    description: "La carte donne le contexte spatial, les cartes donnent le détail.",
    baseline: "Référence",
    allCities: "Toutes les villes",
    serviceFit: "Adéquation {{fit}}",
    fitLevels: {
      high: "Élevée",
      medium: "Moyenne",
      low: "Faible",
    },
    manufacturingFocus: "Focus industriel",
    evidenceStrength: "Force de preuve",
    evidence: "Preuve",
    emptyFiltered:
      "Aucune entreprise concurrente n'a encore été synchronisée pour la sélection actuelle.",
  },
  cityFilter: {
    label: "Périmètre urbain",
    placeholder: "Choisir une ville ou un district",
    selected: "Zones sélectionnées",
    empty:
      "Aucune zone ajoutée pour le moment. Toutes les données concurrentes sont affichées par défaut.",
    validation: "Cochez au moins une ville ou un district avant d'ajouter.",
    duplicate: "Les zones sélectionnées ont déjà été ajoutées.",
    partialDuplicate: "De nouvelles zones ont été ajoutées. {{count}} éléments existaient déjà.",
    checkedSummary: "{{count}} élément(s) cochés",
    addAction: "Ajouter des zones",
    removeAction: "Retirer {{city}}",
    allCities: "Toutes les villes",
    syncedStatus: "{{count}} concurrents de services industriels synchronisés.",
    filteredStatus: "{{count}} concurrents de services industriels dans le périmètre actuel.",
    defaultNote:
      "Utilisez le sélecteur de villes ci-dessus pour élargir ou réduire le périmètre concurrentiel. La carte et les cartes se rafraîchissent ensemble.",
    filteredNote: "La carte et les cartes sont maintenant filtrées selon les zones sélectionnées.",
  },
  sections: enUS.sections,
  entry: {
    source: "Source",
    publishedAt: "Publication",
  },
  empty: {
    priority: "Aucun lead prioritaire fort synchronisé aujourd'hui.",
    pipeline: "Aucune action de suivi aujourd'hui.",
    potential: "Aucun nouveau signal de compte potentiel aujourd'hui.",
    watchlist: "Aucun nouveau mouvement de concurrent aujourd'hui.",
    gaps: "Aucun manque supplémentaire aujourd'hui.",
    accounts: "Aucune nouvelle cible recommandée aujourd'hui.",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSnakeKey(key: string) {
  return key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function withSnakeCaseAliases<T extends Record<string, unknown>>(source: T): T {
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    const translatedValue = isPlainObject(value) ? withSnakeCaseAliases(value) : value;
    const snakeKey = toSnakeKey(key);

    next[key] = translatedValue;
    next[snakeKey] = translatedValue;
  }

  return next as T;
}

const resources = {
  zh: { radar: withSnakeCaseAliases(zh) },
  "zh-CN": { radar: withSnakeCaseAliases(zhCN) },
  ko: { radar: withSnakeCaseAliases(ko) },
  "ko-KP": { radar: withSnakeCaseAliases(ko) },
  ja: { radar: withSnakeCaseAliases(ja) },
  th: { radar: withSnakeCaseAliases(th) },
  "en-US": { radar: withSnakeCaseAliases(enUS) },
  "en-GB": { radar: withSnakeCaseAliases(enUS) },
  fr: { radar: withSnakeCaseAliases(fr) },
} as const;

function normalizeDocumentLanguage(lng: string | undefined) {
  if (!lng || lng === "zh") {
    return "zh-CN";
  }

  return lng;
}

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: "zh-CN",
      defaultNS: "radar",
      ns: ["radar"],
      supportedLngs: ["zh", ...languageOptions.map((item) => item.value)],
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
      },
    });
}

if (typeof window !== "undefined") {
  document.documentElement.lang = normalizeDocumentLanguage(i18n.resolvedLanguage);
  i18n.on("languageChanged", (lng) => {
    document.documentElement.lang = normalizeDocumentLanguage(lng);
  });
}

export default i18n;
