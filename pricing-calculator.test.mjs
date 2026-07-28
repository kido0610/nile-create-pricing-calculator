import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/pricing-calculator/calculations.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const calculator = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const estimateSource = await readFile(new URL("../app/pricing-calculator/estimator.ts", import.meta.url), "utf8");
const estimateOutput = ts.transpileModule(estimateSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const estimator = await import(`data:text/javascript;base64,${Buffer.from(estimateOutput).toString("base64")}`);
const diagnosisSource = await readFile(new URL("../app/pricing-calculator/sales-diagnosis.ts", import.meta.url), "utf8");
const diagnosisOutput = ts.transpileModule(diagnosisSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const diagnosis = await import(`data:text/javascript;base64,${Buffer.from(diagnosisOutput).toString("base64")}`);

test("買い切りの税抜売上・分配・実質時給を計算する", () => {
  const result = calculator.calculatePricing({
    ...calculator.initialCalculatorInput,
    contractType: "one-time",
    taxIncludedSalesPrice: 198000,
    initialBuildHours: 12,
    monthlyMaintenanceHours: 0,
    kidoSharePercent: 50,
    mihitoSharePercent: 50,
    commonExpenseRate: 10,
    businessReserveRate: 10,
    customerDirectCost: 0,
  });
  assert.equal(result.taxExcludedRevenue, 180000);
  assert.equal(result.commonExpense, 18000);
  assert.equal(result.businessReserve, 16200);
  assert.equal(result.kidoShare, 72900);
  assert.equal(result.mihitoShare, 72900);
  assert.equal(result.kidoEffectiveHourlyRate, 6075);
  assert.equal(calculator.isBelowHourlyTarget(result), false);
});

test("サブスクの契約期間売上、ROI、2年目継続収益を計算する", () => {
  const result = calculator.calculatePricing({
    ...calculator.initialCalculatorInput,
    contractType: "subscription",
    initialFee: 55000,
    monthlyFee: 22000,
    minimumContractMonths: 12,
    initialBuildHours: 5,
    monthlyMaintenanceHours: 1,
    kidoSharePercent: 50,
    mihitoSharePercent: 50,
    commonExpenseRate: 10,
    businessReserveRate: 10,
    customerDirectCost: 0,
    customerHourlyCost: 2000,
    beforeMonthlyHours: 20,
    afterMonthlyHours: 5,
    effectRealizationRate: 100,
  });
  assert.equal(result.contractSalesTaxIncluded, 319000);
  assert.equal(result.taxExcludedRevenue, 290000);
  assert.equal(result.customerMonthlySavings, 30000);
  assert.equal(result.customerPaybackMonths, 6.875);
  assert.ok(Math.abs(result.secondYearRevenue - 240000) < 0.001);
});

test("効果実現率と顧客外部費用を反映して3年間ROIを計算する", () => {
  const result = calculator.calculatePricing({
    ...calculator.initialCalculatorInput,
    taxIncludedSalesPrice: 110000,
    effectRealizationRate: 75,
    customerHourlyCost: 2000,
    beforeMonthlyHours: 20,
    afterMonthlyHours: 10,
    customerInitialExternalCost: 10000,
    customerMonthlyExternalCost: 2000,
  });
  assert.equal(result.customerEffectiveMonthlyTimeSaved, 7.5);
  assert.equal(result.customerMonthlySavings, 15000);
  assert.equal(result.customerInitialInvestment, 120000);
  assert.equal(result.customerMonthlyNetBenefit, 13000);
  assert.equal(result.firstYearNetBenefit, 36000);
  assert.equal(result.secondYearNetBenefit, 156000);
  assert.equal(result.threeYearCumulativeNetBenefit, 348000);
  assert.ok(Math.abs(result.customerPaybackMonths - 9.2307) < 0.001);
  assert.ok(result.paybackByEffectRate[50] > result.paybackByEffectRate[75]);
});

test("分配割合が100%でない場合は取り分を確定せず、技術報酬先取りも計算する", () => {
  const invalid = calculator.calculatePricing({ ...calculator.initialCalculatorInput, kidoSharePercent: 60, mihitoSharePercent: 30 });
  assert.match(invalid.shareError, /100/);
  assert.equal(invalid.kidoShare, null);
  const feeFirst = calculator.calculatePricing({ ...calculator.initialCalculatorInput, profitShareMethod: "kido-fee-first", kidoTechnicalFeeHourly: 5000 });
  assert.equal(feeFirst.kidoTechnicalFee, 60000);
  assert.ok(feeFirst.kidoShare > feeFirst.mihitoShare);
});

test("工数見積もりは不確実性バッファを30〜50%に制限し、安全側工数を返す", () => {
  const result = estimator.calculateEstimate({
    ...estimator.initialEstimateInput,
    forms: 2,
    integrations: 1,
    hasDatabase: true,
    uncertaintyBufferRate: 90,
  });
  assert.ok(result.basicDevelopment > 0);
  assert.ok(result.externalIntegrations > 0);
  assert.equal(result.uncertaintyBuffer, result.standardHours * 0.5);
  assert.equal(result.safeHours, result.recommendedHours);
  assert.match(result.features.join(","), /入力フォーム/);
});

test("時給5,000円未満を検出し、導入後工数が増える場合は削減時間を0にする", () => {
  const result = calculator.calculatePricing({
    ...calculator.initialCalculatorInput,
    taxIncludedSalesPrice: 98000,
    initialBuildHours: 20,
    beforeMonthlyHours: 5,
    afterMonthlyHours: 10,
  });
  assert.equal(result.customerMonthlyTimeSaved, 0);
  assert.equal(result.customerMonthlySavings, 0);
  assert.equal(result.customerPaybackMonths, null);
  assert.equal(calculator.isBelowHourlyTarget(result), true);
});

test("CSVにBOMと主要な計算結果を含める", () => {
  const input = { ...calculator.initialCalculatorInput };
  const csv = calculator.toCsv(input, calculator.calculatePricing(input));
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /木戸の実質時間単価/);
  assert.match(csv, /投資回収月数/);
});

test("案件診断は選択した機能・難易度から安全工数と提案プランを計算する", () => {
  const input = {
    ...diagnosis.initialDiagnosticInput,
    userCount: 4,
    monthlyCaseCount: 20,
    minutesPerCase: 30,
    features: { ...diagnosis.initialDiagnosticInput.features, pdf: true, line: true, ocr: true },
    requirementsDifficulty: "hard",
    exceptionHandling: "many",
    dataReadiness: "unorganized",
    bufferRate: 40,
  };
  const result = diagnosis.calculateSalesEstimate(input, diagnosis.defaultSalesSettings);
  assert.equal(result.currentMonthlyHours, 10);
  assert.ok(result.development >= 17);
  assert.ok(result.safeHours > result.standardHours);
  assert.equal(diagnosis.suggestPlan(12, diagnosis.defaultSalesSettings).id, "ume");
  assert.equal(diagnosis.suggestPlan(31, diagnosis.defaultSalesSettings).id, "custom");
});

test("営業コメントとダッシュボードは案件の試算値を集約する", () => {
  const input = { ...diagnosis.initialDiagnosticInput, companyName: "テスト株式会社", automationGoal: "見積書作成", monthlyCaseCount: 10, minutesPerCase: 60, features: { ...diagnosis.initialDiagnosticInput.features, pdf: true } };
  const estimate = diagnosis.calculateSalesEstimate(input, diagnosis.defaultSalesSettings);
  const plan = diagnosis.suggestPlan(estimate.safeHours, diagnosis.defaultSalesSettings);
  assert.match(diagnosis.createSalesComment(input, estimate, plan, 8), /テスト株式会社/);
  const dashboard = diagnosis.calculateDashboard([
    { status: "won", estimatedHours: 10, kidoShare: 70000, kidoHourly: 7000, roi: 120 },
    { status: "proposal", estimatedHours: 20, kidoShare: 50000, kidoHourly: 5000, roi: 80 },
    { status: "lost", estimatedHours: 30, kidoShare: null, kidoHourly: null, roi: null },
  ]);
  assert.equal(dashboard.totalCases, 3);
  assert.equal(dashboard.orderRate, 50);
  assert.equal(dashboard.averageProfit, 60000);
});
