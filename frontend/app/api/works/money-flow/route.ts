import { withApiAccessLog } from "@/lib/server/api-access";
import {
  listGyoseiYears,
  listPendingGyoseiYears,
  loadGyoseiSummary,
  queryMoneyFlow,
} from "@/lib/server/gyosei-data";
import { PAYEE_SECTORS } from "@/lib/gyosei-sectors";
import { isAddressLookupReady } from "@/lib/server/company-address";
import type { MoneyFlowFocusKind } from "@/lib/types/gyosei";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const years = listGyoseiYears();
      const yearParam = Number(searchParams.get("year"));
      const year = Number.isFinite(yearParam) ? yearParam : years[years.length - 1];
      const ministry = searchParams.get("ministry") ?? undefined;
      const payee = searchParams.get("payee") ?? undefined;
      const sector = searchParams.get("sector") ?? undefined;
      const focusKind = (searchParams.get("focusKind") as MoneyFlowFocusKind | null) ?? undefined;
      const focusValue = searchParams.get("focusValue") ?? undefined;
      const limitParam = Number(searchParams.get("limit"));
      const limit = Number.isFinite(limitParam) ? limitParam : undefined;

      if (searchParams.get("meta") === "1") {
        const summary = loadGyoseiSummary();
        return Response.json({
          unit: summary.unit,
          source: summary.source,
          years: summary.years.map((entry) => ({
            fiscalYear: entry.fiscalYear,
            total: entry.total,
            projectCount: entry.projectCount,
            flowCount: entry.flowCount,
            available: true,
            ministries: entry.ministries.map((ministryEntry) => ({
              name: ministryEntry.name,
              amount: ministryEntry.amount,
              projectCount: ministryEntry.projectCount,
            })),
          })),
          pendingYears: listPendingGyoseiYears().map((fiscalYear) => ({
            fiscalYear,
            available: false,
          })),
          sectors: PAYEE_SECTORS.map((item) => ({ id: item.id, label: item.label })),
          topPayees: summary.topPayees.slice(0, 20),
          houjinEnabled: isAddressLookupReady(),
        });
      }

      const result = await queryMoneyFlow({
        year,
        ministry,
        payee,
        sector,
        focusKind,
        focusValue,
        limit,
      });
      return Response.json(result);
    } catch (error) {
      console.error("[money-flow]", error);
      return Response.json(
        { error: "行政事業レビューデータの読み込みに失敗しました。" },
        { status: 500 },
      );
    }
  });
}
