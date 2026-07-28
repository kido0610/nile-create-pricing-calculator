export type ContractType = "one-time" | "subscription";
export type ProfitShareMethod = "after-expenses" | "kido-fee-first" | "sales-commission-first";

export type CalculatorInput = {
  contractType: ContractType; profitShareMethod: ProfitShareMethod;
  taxIncludedSalesPrice: number; initialFee: number; monthlyFee: number; minimumContractMonths: number;
  initialBuildHours: number; monthlyMaintenanceHours: number; kidoSharePercent: number; mihitoSharePercent: number;
  commonExpenseRate: number; businessReserveRate: number; customerDirectCost: number;
  kidoTechnicalFeeHourly: number; salesCommissionRate: number;
  customerHourlyCost: number; beforeMonthlyHours: number; afterMonthlyHours: number; effectRealizationRate: number;
  customerInitialExternalCost: number; customerMonthlyExternalCost: number;
};

export type CalculationResult = {
  contractSalesTaxIncluded: number; taxExcludedRevenue: number; totalContractRevenue: number;
  commonExpense: number; businessReserve: number; customerDirectCost: number; distributableProfit: number;
  salesCommission: number; kidoTechnicalFee: number; remainingProfit: number; kidoShare: number | null; mihitoShare: number | null;
  shareTotalPercent: number; shareError: string | null;
  kidoTotalTechnicalHours: number; kidoEffectiveHourlyRate: number | null; theoreticalMaxHours: number | null; recommendedSafeHours: number | null; safetyMarginHours: number | null; hourlyAt20PercentOver: number | null; hourlyAt50PercentOver: number | null;
  customerMonthlyTimeSaved: number; customerEffectiveMonthlyTimeSaved: number; customerMonthlySavings: number; customerMonthlyRecurringCost: number; customerMonthlyNetBenefit: number;
  customerAnnualSavings: number; customerInitialInvestment: number; firstYearNetBenefit: number; secondYearNetBenefit: number; threeYearCumulativeNetBenefit: number; investmentReturnRate: number | null; customerPaybackMonths: number | null; paybackByEffectRate: Record<50 | 75 | 100, number | null>;
  firstYearRevenue: number; secondYearRevenue: number; firstYearKidoShare: number | null; secondYearKidoShare: number | null;
};

export const TAX_RATE = 0.1;
export const HOURLY_TARGET = 5000;
export const SAFE_HOURS_RATIO = 0.8;
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);
const rate = (value: number) => nonNegative(value) / 100;
const yenRound = (value: number) => Math.round(value);

export const initialCalculatorInput: CalculatorInput = {
  contractType: "one-time", profitShareMethod: "after-expenses", taxIncludedSalesPrice: 198000, initialFee: 0, monthlyFee: 0, minimumContractMonths: 12,
  initialBuildHours: 12, monthlyMaintenanceHours: 0, kidoSharePercent: 50, mihitoSharePercent: 50, commonExpenseRate: 10, businessReserveRate: 10, customerDirectCost: 0,
  kidoTechnicalFeeHourly: 5000, salesCommissionRate: 10,
  customerHourlyCost: 2000, beforeMonthlyHours: 20, afterMonthlyHours: 5, effectRealizationRate: 75, customerInitialExternalCost: 0, customerMonthlyExternalCost: 0,
};

function annualRevenue(input: CalculatorInput, year: 1 | 2) {
  if (input.contractType === "one-time") return year === 1 ? nonNegative(input.taxIncludedSalesPrice) / 1.1 : 0;
  return (year === 1 ? nonNegative(input.initialFee) + nonNegative(input.monthlyFee) * 12 : nonNegative(input.monthlyFee) * 12) / 1.1;
}

function distribute(revenue: number, directCost: number, input: CalculatorInput, technicalHours: number) {
  const commonExpense = yenRound(revenue * rate(input.commonExpenseRate));
  const operatingProfit = revenue - directCost - commonExpense;
  const businessReserve = yenRound(Math.max(0, operatingProfit) * rate(input.businessReserveRate));
  const distributableProfit = yenRound(operatingProfit - businessReserve);
  const salesCommission = input.profitShareMethod === "sales-commission-first" ? yenRound(Math.max(0, distributableProfit) * rate(input.salesCommissionRate)) : 0;
  const possibleTechnicalFee = yenRound(technicalHours * nonNegative(input.kidoTechnicalFeeHourly));
  const kidoTechnicalFee = input.profitShareMethod === "kido-fee-first" ? Math.min(Math.max(0, distributableProfit), possibleTechnicalFee) : 0;
  const remainingProfit = yenRound(distributableProfit - salesCommission - kidoTechnicalFee);
  const shareTotalPercent = nonNegative(input.kidoSharePercent) + nonNegative(input.mihitoSharePercent);
  const shareError = Math.abs(shareTotalPercent - 100) < 0.0001 ? null : "木戸とみひとの分配割合の合計を100%にしてください。";
  return {
    commonExpense, businessReserve, distributableProfit, salesCommission, kidoTechnicalFee, remainingProfit, shareTotalPercent, shareError,
    kidoShare: shareError ? null : yenRound(kidoTechnicalFee + remainingProfit * rate(input.kidoSharePercent)),
    mihitoShare: shareError ? null : yenRound(remainingProfit * rate(input.mihitoSharePercent)),
  };
}

function payback(upfront: number, monthlySavings: number, monthlyCost: number) {
  const net = monthlySavings - monthlyCost;
  return net > 0 ? upfront / net : null;
}

export function calculatePricing(input: CalculatorInput): CalculationResult {
  const months = nonNegative(input.minimumContractMonths);
  const contractSalesTaxIncluded = input.contractType === "one-time" ? nonNegative(input.taxIncludedSalesPrice) : nonNegative(input.initialFee) + nonNegative(input.monthlyFee) * months;
  const taxExcludedRevenue = yenRound(contractSalesTaxIncluded / (1 + TAX_RATE));
  const kidoTotalTechnicalHours = nonNegative(input.initialBuildHours) + nonNegative(input.monthlyMaintenanceHours) * months;
  const distribution = distribute(taxExcludedRevenue, nonNegative(input.customerDirectCost), input, kidoTotalTechnicalHours);
  const kidoEffectiveHourlyRate = distribution.kidoShare !== null && kidoTotalTechnicalHours > 0 ? distribution.kidoShare / kidoTotalTechnicalHours : null;
  const customerMonthlyTimeSaved = Math.max(0, nonNegative(input.beforeMonthlyHours) - nonNegative(input.afterMonthlyHours));
  const customerEffectiveMonthlyTimeSaved = customerMonthlyTimeSaved * rate(input.effectRealizationRate);
  const customerMonthlySavings = yenRound(customerEffectiveMonthlyTimeSaved * nonNegative(input.customerHourlyCost));
  const monthlyCustomerCharge = input.contractType === "subscription" ? nonNegative(input.monthlyFee) : 0;
  const customerMonthlyRecurringCost = monthlyCustomerCharge + nonNegative(input.customerMonthlyExternalCost);
  const customerMonthlyNetBenefit = customerMonthlySavings - customerMonthlyRecurringCost;
  const customerInitialInvestment = (input.contractType === "subscription" ? nonNegative(input.initialFee) : nonNegative(input.taxIncludedSalesPrice)) + nonNegative(input.customerInitialExternalCost);
  const customerAnnualSavings = customerMonthlySavings * 12;
  const firstYearNetBenefit = customerAnnualSavings - customerInitialInvestment - customerMonthlyRecurringCost * 12;
  const secondYearNetBenefit = customerAnnualSavings - customerMonthlyRecurringCost * 12;
  const threeYearCumulativeNetBenefit = firstYearNetBenefit + secondYearNetBenefit * 2;
  const threeYearInvestment = customerInitialInvestment + customerMonthlyRecurringCost * 36;
  const firstYearDistribution = distribute(annualRevenue(input, 1), nonNegative(input.customerDirectCost), input, kidoTotalTechnicalHours);
  const secondYearDistribution = distribute(annualRevenue(input, 2), 0, input, nonNegative(input.monthlyMaintenanceHours) * 12);
  const effectPayback = (effectRate: 50 | 75 | 100) => payback(customerInitialInvestment, customerMonthlyTimeSaved * rate(effectRate) * nonNegative(input.customerHourlyCost), customerMonthlyRecurringCost);
  return {
    contractSalesTaxIncluded, taxExcludedRevenue, totalContractRevenue: taxExcludedRevenue, customerDirectCost: nonNegative(input.customerDirectCost), ...distribution,
    kidoTotalTechnicalHours, kidoEffectiveHourlyRate,
    theoreticalMaxHours: distribution.kidoShare === null ? null : Math.max(0, distribution.kidoShare / HOURLY_TARGET),
    recommendedSafeHours: distribution.kidoShare === null ? null : Math.max(0, distribution.kidoShare / HOURLY_TARGET) * SAFE_HOURS_RATIO,
    safetyMarginHours: distribution.kidoShare === null ? null : Math.max(0, distribution.kidoShare / HOURLY_TARGET) * SAFE_HOURS_RATIO - kidoTotalTechnicalHours,
    hourlyAt20PercentOver: distribution.kidoShare === null ? null : distribution.kidoShare / (kidoTotalTechnicalHours * 1.2),
    hourlyAt50PercentOver: distribution.kidoShare === null ? null : distribution.kidoShare / (kidoTotalTechnicalHours * 1.5),
    customerMonthlyTimeSaved, customerEffectiveMonthlyTimeSaved, customerMonthlySavings, customerMonthlyRecurringCost, customerMonthlyNetBenefit, customerAnnualSavings, customerInitialInvestment,
    firstYearNetBenefit, secondYearNetBenefit, threeYearCumulativeNetBenefit, investmentReturnRate: threeYearInvestment > 0 ? threeYearCumulativeNetBenefit / threeYearInvestment * 100 : null,
    customerPaybackMonths: payback(customerInitialInvestment, customerMonthlySavings, customerMonthlyRecurringCost), paybackByEffectRate: { 50: effectPayback(50), 75: effectPayback(75), 100: effectPayback(100) },
    firstYearRevenue: yenRound(annualRevenue(input, 1)), secondYearRevenue: yenRound(annualRevenue(input, 2)), firstYearKidoShare: firstYearDistribution.kidoShare, secondYearKidoShare: secondYearDistribution.kidoShare,
  };
}

export function hourlyRateStatus(value: number | null) { return value === null || value < 5000 ? "red" : value < 6000 ? "yellow" : "green"; }
export function isBelowHourlyTarget(result: CalculationResult) { return hourlyRateStatus(result.kidoEffectiveHourlyRate) === "red"; }
export const pricingPresets = [
  { id: "trial", label: "お試し", taxIncludedSalesPrice: 98000, initialBuildHours: 5 }, { id: "ume", label: "梅", taxIncludedSalesPrice: 198000, initialBuildHours: 12 }, { id: "take", label: "竹", taxIncludedSalesPrice: 298000, initialBuildHours: 18 }, { id: "matsu", label: "松", taxIncludedSalesPrice: 498000, initialBuildHours: 30 }, { id: "custom", label: "完全オーダー（698,000円から）", taxIncludedSalesPrice: 698000, initialBuildHours: 42 },
] as const;
export function toCsv(input: CalculatorInput, result: CalculationResult) {
  const rows = [["項目", "値"], ["契約形態", input.contractType === "one-time" ? "買い切り" : "サブスク"], ["税抜売上", result.taxExcludedRevenue], ["木戸の想定取り分", result.kidoShare ?? "分配割合エラー"], ["木戸の実質時間単価", result.kidoEffectiveHourlyRate ?? "分配割合エラー"], ["顧客の月間削減額", result.customerMonthlySavings], ["1年目の純便益", result.firstYearNetBenefit], ["3年間の累積純便益", result.threeYearCumulativeNetBenefit], ["投資回収月数", result.customerPaybackMonths ?? "回収不可"]];
  return `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
}
