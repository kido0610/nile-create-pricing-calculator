export const FEATURE_DEFINITIONS = [
  ["inputForm", "入力フォーム", 2], ["database", "データベース", 8], ["pdf", "PDF生成", 4], ["excel", "Excel出力", 3], ["spreadsheet", "スプレッドシート連携", 3], ["gmail", "Gmail送信", 3], ["line", "LINE連携", 5], ["slack", "Slack連携", 4], ["chatwork", "Chatwork連携", 4], ["ocr", "OCR", 8], ["openai", "OpenAI", 5], ["claude", "Claude", 5], ["gemini", "Gemini", 5], ["scraping", "Webスクレイピング", 8], ["api", "API連携", 4], ["aiChat", "AIチャット", 8], ["dashboard", "ダッシュボード", 6], ["roles", "権限管理", 5], ["login", "ログイン", 8], ["notifications", "通知機能", 3], ["backup", "バックアップ", 3], ["csvImport", "CSV取込", 3], ["csvExport", "CSV出力", 2],
] as const;

export type FeatureId = typeof FEATURE_DEFINITIONS[number][0];
export type Difficulty = "easy" | "normal" | "hard";
export type CaseStatus = "proposal" | "won" | "lost";
export type DiagnosticInput = {
  companyName: string; contactName: string; industry: string; employeeCount: number; monthlySales: number; userCount: number;
  automationGoal: string; currentTools: string; currentFlow: string; monthlyCaseCount: number; minutesPerCase: number;
  features: Record<FeatureId, boolean>; requirementsDifficulty: Difficulty; exceptionHandling: "few" | "normal" | "many";
  dataReadiness: "organized" | "partial" | "unorganized"; customerItLiteracy: "high" | "normal" | "low"; bufferRate: number; status: CaseStatus;
};
export type SalesSettings = { featureHours: Record<FeatureId, number>; planThresholds: { id: "trial" | "ume" | "take" | "matsu" | "custom"; label: string; maxHours: number; price: number }[] };

const features = Object.fromEntries(FEATURE_DEFINITIONS.map(([id]) => [id, false])) as Record<FeatureId, boolean>;
export const initialDiagnosticInput: DiagnosticInput = { companyName: "", contactName: "", industry: "", employeeCount: 0, monthlySales: 0, userCount: 1, automationGoal: "", currentTools: "", currentFlow: "", monthlyCaseCount: 0, minutesPerCase: 0, features, requirementsDifficulty: "normal", exceptionHandling: "normal", dataReadiness: "partial", customerItLiteracy: "normal", bufferRate: 40, status: "proposal" };
export const defaultSalesSettings: SalesSettings = { featureHours: Object.fromEntries(FEATURE_DEFINITIONS.map(([id, , hours]) => [id, hours])) as Record<FeatureId, number>, planThresholds: [
  { id: "trial", label: "お試し", maxHours: 5, price: 98000 }, { id: "ume", label: "梅", maxHours: 12, price: 198000 }, { id: "take", label: "竹", maxHours: 18, price: 298000 }, { id: "matsu", label: "松", maxHours: 30, price: 498000 }, { id: "custom", label: "完全オーダー", maxHours: 999999, price: 698000 },
] };
const safe = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);
const labels = Object.fromEntries(FEATURE_DEFINITIONS.map(([id, label]) => [id, label])) as Record<FeatureId, string>;
export const selectedDiagnosticFeatures = (input: DiagnosticInput) => FEATURE_DEFINITIONS.filter(([id]) => input.features[id]).map(([id]) => labels[id]);
export function calculateSalesEstimate(input: DiagnosticInput, settings: SalesSettings) {
  const requirements = ({ easy: 3, normal: 7, hard: 12 } as const)[input.requirementsDifficulty] + ({ organized: 0, partial: 3, unorganized: 7 } as const)[input.dataReadiness] + ({ high: 0, normal: 1, low: 3 } as const)[input.customerItLiteracy];
  const development = FEATURE_DEFINITIONS.reduce((sum, [id]) => sum + (input.features[id] ? safe(settings.featureHours[id]) : 0), 0);
  const testing = (development + requirements) * ({ few: .15, normal: .25, many: .4 } as const)[input.exceptionHandling];
  const onboarding = 1 + Math.min(4, safe(input.userCount) * .25);
  const revisions = ({ few: 1, normal: 3, many: 6 } as const)[input.exceptionHandling] + ({ organized: 0, partial: 1, unorganized: 3 } as const)[input.dataReadiness];
  const standardHours = development + requirements + testing + onboarding + revisions;
  const bufferRate = Math.min(.5, Math.max(.3, safe(input.bufferRate) / 100));
  const buffer = standardHours * bufferRate;
  return { requirements, development, testing, onboarding, revisions, buffer, minimumHours: standardHours * .8, standardHours, safeHours: standardHours + buffer, recommendedHours: standardHours + buffer, selectedFeatures: selectedDiagnosticFeatures(input), currentMonthlyHours: safe(input.monthlyCaseCount) * safe(input.minutesPerCase) / 60 };
}
export function suggestPlan(hours: number, settings: SalesSettings) { return [...settings.planThresholds].sort((a, b) => a.maxHours - b.maxHours).find((plan) => hours <= plan.maxHours) ?? settings.planThresholds[settings.planThresholds.length - 1]; }
export function createSalesComment(input: DiagnosticInput, estimate: ReturnType<typeof calculateSalesEstimate>, plan: ReturnType<typeof suggestPlan>, paybackMonths: number | null) {
  const subject = input.companyName ? `${input.companyName}様` : "現在の業務"; const goal = input.automationGoal || "対象業務"; const features = estimate.selectedFeatures.length ? `必要機能は${estimate.selectedFeatures.join("、")}を想定しています。` : "必要機能はヒアリングに合わせて確定します。";
  const savings = estimate.currentMonthlyHours ? `現在は毎月約${estimate.currentMonthlyHours.toFixed(1)}時間を${goal}に使われています。導入により削減できる可能性があります。` : `今回の${goal}を整理し、削減できる時間を試算します。`;
  const payback = paybackMonths === null ? "回収期間は、導入後の実績を踏まえて再確認します。" : `想定回収期間は約${paybackMonths.toFixed(1)}か月です。`;
  return `${subject}へのご提案です。${savings}${features}開発規模は${plan.label}プラン相当（安全側で約${estimate.safeHours.toFixed(1)}時間）です。${payback}`;
}
export type DashboardCase = { status: CaseStatus; estimatedHours: number; kidoShare: number | null; kidoHourly: number | null; roi: number | null };
export function calculateDashboard(cases: DashboardCase[]) { const avg = (values: (number | null)[]) => { const valid = values.filter((v): v is number => v !== null && Number.isFinite(v)); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; }; const proposed = cases.filter((x) => x.status !== "lost"); const won = cases.filter((x) => x.status === "won"); return { totalCases: cases.length, averageProfit: avg(cases.map((x) => x.kidoShare)), averageHourly: avg(cases.map((x) => x.kidoHourly)), averageRoi: avg(cases.map((x) => x.roi)), averageHours: avg(cases.map((x) => x.estimatedHours)), orderRate: proposed.length ? won.length / proposed.length * 100 : null }; }
