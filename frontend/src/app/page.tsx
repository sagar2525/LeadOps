"use client";

import GlobalDateRangePicker from "@/components/DateRangePicker";
import { AreaChart, BarChart, Card, DateRangePickerValue, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Text, Title } from "@tremor/react";
import { Activity, Radio, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type DashboardSummary = {
  generatedAt: string;
  filters: {
    from: string | null;
    to: string | null;
  };
  overview: {
    totalLeads: number;
    contactedLeads: number;
    bookedAppointments: number;
    apptBookingRatePct: number;
    qualApptBookingRatePct: number;
    leadsInProgress: number;
    disqualified: number;
    agedLeads: number;
    shows: number;
    noShows: number;
    showRatePct: number;
  };
  activity: {
    avgSpeedToLeadMin: number;
    outboundDials: number;
    outboundSms: number;
    outboundEmails: number;
    callBookedAppointments: number;
    smsBookedAppointments: number;
    emailBookedAppointments: number;
    upcomingAppointments: number;
  };
  funnel: Array<{ label: string; value: number }>;
  dqBreakdown: Array<{ reason: string; count: number }>;
  byCompany: Array<{
    companyName: string;
    ghlSubAccountId: string;
    leadCount: number;
    contactedCount: number;
    bookedCount: number;
    showCount: number;
    noShowCount: number;
    dialCount: number;
    bookingRatePct: number;
    qualBookingRatePct: number;
    showRatePct: number;
    avgSpeedToLeadMin: number;
    setters: Array<{
      setterName: string;
      leadCount: number;
      bookedCount: number;
      showCount: number;
      dialCount: number;
      bookingRatePct: number;
      showRatePct: number;
      avgSpeedToLeadMin: number;
    }>;
  }>;
  agedLeadRows: Array<{
    id: string;
    fullName: string;
    phoneNumber: string;
    companyName: string;
    assignedSetter: string;
    status: string;
    createdAt: string;
    daysOpen: number;
    speedToLeadMin: number;
    callCount: number;
    smsCount: number;
    emailCount: number;
  }>;
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:3001";

function formatMetric(value: number, suffix = "") {
  return `${new Intl.NumberFormat("en-US").format(value)}${suffix}`;
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangePickerValue>({
    from: undefined,
    to: undefined,
  });
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let eventSource: EventSource | null = null;

    async function loadSummary() {
      setLoading(true);
      setError(null);
      setLiveConnected(false);

      const search = new URLSearchParams();

      if (dateRange?.from) {
        search.set("from", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        search.set("to", dateRange.to.toISOString());
      }

      try {
        const response = await fetch(
          `${apiBaseUrl}/api/v1/dashboard/summary?${search.toString()}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Failed to load dashboard summary.");
        }

        const payload = (await response.json()) as DashboardSummary;
        setSummary(payload);

        eventSource = new EventSource(
          `${apiBaseUrl}/api/v1/dashboard/stream?${search.toString()}`
        );

        eventSource.onopen = () => {
          setLiveConnected(true);
          setError(null);
        };

        eventSource.onmessage = (event) => {
          const livePayload = JSON.parse(event.data) as DashboardSummary;
          setSummary(livePayload);
          setLiveConnected(true);
          setError(null);
        };

        eventSource.onerror = () => {
          setLiveConnected(false);
        };
      } catch (fetchError: unknown) {
        if (controller.signal.aborted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : "Unknown error.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      controller.abort();
      eventSource?.close();
    };
  }, [dateRange]);

  const kpis = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [
      { label: "New Leads", value: formatMetric(summary.overview.totalLeads) },
      { label: "Booked Appointments", value: formatMetric(summary.overview.bookedAppointments) },
      { label: "Appt Booking Rate", value: `${summary.overview.apptBookingRatePct}%` },
      { label: "Qual Appt Booking Rate", value: `${summary.overview.qualApptBookingRatePct}%` },
      { label: "Leads In Progress", value: formatMetric(summary.overview.leadsInProgress) },
      { label: "Disqualified", value: formatMetric(summary.overview.disqualified) },
      { label: "Aged Leads", value: formatMetric(summary.overview.agedLeads) },
      { label: "Shows", value: formatMetric(summary.overview.shows) },
      { label: "No Shows", value: formatMetric(summary.overview.noShows) },
      { label: "Show Rate", value: `${summary.overview.showRatePct}%` },
      { label: "Contacted Leads", value: formatMetric(summary.overview.contactedLeads) },
      { label: "Upcoming Appts", value: formatMetric(summary.activity.upcomingAppointments) },
      { label: "Call - Booked Appts", value: formatMetric(summary.activity.callBookedAppointments) },
      { label: "SMS - Booked Appts", value: formatMetric(summary.activity.smsBookedAppointments) },
      { label: "Email - Booked Appts", value: formatMetric(summary.activity.emailBookedAppointments) },
    ];
  }, [summary]);

  const callingStats = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [
      { label: "Speed To Lead (Min)", value: formatMetric(summary.activity.avgSpeedToLeadMin) },
      { label: "Outbound Dials", value: formatMetric(summary.activity.outboundDials) },
      { label: "Outbound SMS", value: formatMetric(summary.activity.outboundSms) },
      { label: "Email Touches", value: formatMetric(summary.activity.outboundEmails) },
    ];
  }, [summary]);

  return (
    <main id="overview" className="dashboard-shell space-y-8">
      <section className="glass-panel cream-inset rounded-[1.6rem] px-5 py-5 md:px-6 md:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Title className="!text-3xl !font-semibold !tracking-tight !text-[#2b241d] md:!text-4xl">
              GHL Lead Report
            </Title>
            <Text className="mt-1 !max-w-2xl !text-sm !text-[#6f6251] md:!text-base">
              Live stats for leads, calling activity, funnel conversion, and aging.
            </Text>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="w-full lg:w-[360px]">
              <GlobalDateRangePicker value={dateRange} onValueChange={setDateRange} />
            </div>
            {summary ? (
              <div className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    liveConnected
                      ? "bg-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.45)]"
                      : "bg-[#d5ab56] shadow-[0_0_16px_rgba(213,171,86,0.45)]"
                  }`}
                />
                <Text className="!text-xs !text-[#6f6251] md:!text-sm">
                  {liveConnected ? "Live refreshed" : "Snapshot refreshed"}{" "}
                  {new Date(summary.generatedAt).toLocaleString()}
                </Text>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {loading ? (
        <section className="section-card p-8 text-center text-slate-200">Loading dashboard metrics...</section>
      ) : error ? (
        <section className="section-card p-8 text-center text-rose-200">{error}</section>
      ) : summary ? (
        <>
          <section id="kpis" className="space-y-4">
            <div>
              <Title className="!text-3xl !font-semibold !text-[#2b241d]">Stats</Title>
              <Text className="mt-1 !text-[#7a6c5c]">
                Looker-style report cards for your most important GHL metrics.
              </Text>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {kpis.map((card) => (
                <div key={card.label} className="metric-card px-5 py-5 text-center">
                  <div className="text-lg font-medium text-[#3c3025]">{card.label}</div>
                  <div className="mt-4 text-5xl font-semibold tracking-tight text-[#201913]">
                    {card.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="calling-stats" className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <div className="section-card p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eadf] text-[#8f7754]">
                    <Activity size={20} />
                  </div>
                  <Title className="!text-4xl !font-semibold !text-[#2b241d]">Calling Stats</Title>
                </div>
                <div className="text-sm uppercase tracking-[0.3em] text-[#9b8b78]">Formula Driven</div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {callingStats.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-[1.45rem] border border-[#ddd1c0] bg-[linear-gradient(180deg,#ffffff_0%,#f6f1e8_100%)] px-5 py-5 text-center shadow-[0_14px_28px_rgba(85,67,47,0.06)]"
                  >
                    <div className="text-lg font-medium text-[#3c3025]">{card.label}</div>
                    <div className="mt-3 text-5xl font-semibold tracking-tight text-[#201913]">
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eadf] text-[#8f7754]">
                  <Radio size={19} />
                </div>
                <Title className="!text-2xl !font-semibold !text-[#2b241d]">Lead Funnel</Title>
              </div>
              <BarChart
                className="mt-6"
                data={summary.funnel}
                index="label"
                categories={["value"]}
                colors={["amber"]}
                yAxisWidth={52}
                showLegend={false}
                valueFormatter={(value) => formatMetric(value)}
              />
            </div>
          </section>

          <section id="company-rollup" className="space-y-6">
            <div className="space-y-6">
              <Card id="dq-breakdown" className="section-card !border-none !bg-transparent !p-6 !shadow-none">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eadf] text-[#8f7754]">
                    <TriangleAlert size={19} />
                  </div>
                  <Title className="!text-2xl !font-semibold !text-[#2b241d]">DQ Breakdown</Title>
                </div>
                <AreaChart
                  className="mt-6"
                  data={summary.dqBreakdown.map((item) => ({
                    reason: item.reason,
                    count: item.count,
                  }))}
                  index="reason"
                  categories={["count"]}
                  colors={["amber"]}
                  showLegend={false}
                  valueFormatter={(value) => formatMetric(value)}
                  yAxisWidth={44}
                />
                <div className="mt-5 space-y-2">
                  {summary.dqBreakdown.length === 0 ? (
                    <div className="rounded-2xl border border-[#ddd1c0] bg-[linear-gradient(180deg,#ffffff_0%,#f7f1e7_100%)] px-4 py-4 text-sm text-[#7a6c5c]">
                      No disqualification reasons found in the selected range.
                    </div>
                  ) : (
                    summary.dqBreakdown.map((item) => (
                      <div
                        key={item.reason}
                        className="flex items-center justify-between rounded-2xl border border-[#ddd1c0] bg-[linear-gradient(180deg,#ffffff_0%,#f7f1e7_100%)] px-4 py-4"
                      >
                        <div className="text-sm font-medium text-[#3c3025]">{item.reason}</div>
                        <div className="text-lg font-semibold text-[#201913]">{item.count}</div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

            </div>
          </section>

          <section id="aged-leads" className="section-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Title className="!text-3xl !font-semibold !text-[#2b241d]">Aged Lead Alert</Title>
                <Text className="mt-2 !text-[#7a6c5c]">
                  Leads marked `Aged` or `In Progress` for more than 14 days.
                </Text>
              </div>
              <div className="rounded-full border border-[#dbc592] bg-[#f7efdb] px-4 py-2 text-sm font-medium text-[#8b6d34]">
                {summary.agedLeadRows.length} flagged
              </div>
            </div>
            <div className="mt-6 overflow-x-auto">
              <Table className="[&_thead]:border-[#e7dccd]">
                <TableHead>
                  <TableRow className="border-[#e7dccd]">
                    <TableHeaderCell className="!text-[#7e705f]">Lead</TableHeaderCell>
                    <TableHeaderCell className="!text-[#7e705f]">Company</TableHeaderCell>
                    <TableHeaderCell className="!text-[#7e705f]">Setter</TableHeaderCell>
                    <TableHeaderCell className="!text-[#7e705f]">Days Open</TableHeaderCell>
                    <TableHeaderCell className="!text-[#7e705f]">Status</TableHeaderCell>
                    <TableHeaderCell className="!text-[#7e705f]">Speed</TableHeaderCell>
                    <TableHeaderCell className="!text-[#7e705f]">Touches</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.agedLeadRows.length === 0 ? (
                    <TableRow className="border-[#e7dccd]">
                      <TableCell className="!text-[#7a6c5c]" colSpan={7}>
                        No aged leads in the selected range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.agedLeadRows.map((lead) => (
                      <TableRow key={lead.id} className="border-[#e7dccd]">
                        <TableCell className="!text-[#241d18]">
                          <div className="font-medium">{lead.fullName}</div>
                          <div className="text-sm text-[#7a6c5c]">{lead.phoneNumber}</div>
                        </TableCell>
                        <TableCell className="!text-[#4b4035]">{lead.companyName}</TableCell>
                        <TableCell className="!text-[#4b4035]">{lead.assignedSetter}</TableCell>
                        <TableCell className="!text-[#4b4035]">{lead.daysOpen}</TableCell>
                        <TableCell className="!text-[#4b4035]">{lead.status}</TableCell>
                        <TableCell className="!text-[#4b4035]">{lead.speedToLeadMin}m</TableCell>
                        <TableCell className="!text-[#4b4035]">
                          C:{lead.callCount} / S:{lead.smsCount} / E:{lead.emailCount}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
