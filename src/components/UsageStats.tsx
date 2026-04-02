"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  TooltipProps,
} from "recharts";

interface DayStats {
  date: string;
  committed: number;
  reserved: number;
  limit: number;
  utilization: number;
}

interface UsageStatsData {
  plan: string;
  daily_limit: number;
  period: { from: string; to: string };
  days: DayStats[];
  summary: {
    total_committed: number;
    avg_daily: number;
    peak_day: { date: string; count: number };
    current_streak: number;
  };
}

interface Props {
  userId: number;
  /** Initial days window. The user can change it via the selector. Default: 7 */
  initialDays?: number;
}

const DAY_OPTIONS = [7, 14, 30, 90] as const;
type DayOption = (typeof DAY_OPTIONS)[number];

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function barColor(utilization: number): string {
  if (utilization >= 0.9) return "#f87171";
  if (utilization >= 0.7) return "#fb923c";
  return "#818cf8";
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const committed = payload.find((p) => p.dataKey === "committed")?.value ?? 0;
  const reserved = payload.find((p) => p.dataKey === "reserved")?.value ?? 0;
  const total = (committed as number) + (reserved as number);
  return (
    <div style={tooltipStyle}>
      <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#e2e8f0" }}>{formatDate(label as string)}</p>
      <p style={{ margin: "2px 0", fontSize: 12, color: "#818cf8" }}>Committed: {committed}</p>
      {(reserved as number) > 0 && (
        <p style={{ margin: "2px 0", fontSize: 12, color: "#475569" }}>Reserved: {reserved}</p>
      )}
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b", borderTop: "1px solid #1e293b", paddingTop: 6 }}>
        Total: {total}
      </p>
    </div>
  );
}

export default function UsageStats({ userId, initialDays = 7 }: Props) {
  const [days, setDays] = useState<DayOption>(
    DAY_OPTIONS.includes(initialDays as DayOption) ? (initialDays as DayOption) : 7
  );
  const [data, setData] = useState<UsageStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Detect user's local timezone and pass it to the API
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/usage/stats?days=${days}&tz=${encodeURIComponent(tz)}`, {
      headers: { "x-user-id": String(userId) },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
        }
        return res.json() as Promise<UsageStatsData>;
      })
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [userId, days]);

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={shimmerRow} />
        <div style={{ ...shimmerRow, width: "60%", marginTop: 12 }} />
        <div style={{ ...shimmerRow, height: 160, marginTop: 24, borderRadius: 8 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ ...cardStyle, borderColor: "#7f1d1d" }} role="alert">
        <p style={{ color: "#f87171", margin: 0 }}>⚠ {error ?? "No data returned"}</p>
      </div>
    );
  }

  const today = data.days[data.days.length - 1];
  const { summary } = data;
  const todayPct = Math.min((today?.committed ?? 0) / data.daily_limit, 1) * 100;

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Usage Analytics</p>
          <h1 style={titleStyle}>
            {formatDate(data.period.from)} — {formatDate(data.period.to)}
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Days selector */}
          <div style={selectorStyle} role="group" aria-label="Select time range">
            {DAY_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setDays(opt)}
                aria-pressed={days === opt}
                style={{
                  ...selectorBtnStyle,
                  ...(days === opt ? selectorBtnActiveStyle : {}),
                }}
              >
                {opt}d
              </button>
            ))}
          </div>
          <span style={planBadgeStyle}>{data.plan}</span>
        </div>
      </div>

      {/* Today's progress */}
      <div style={progressSectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={labelStyle}>Today&apos;s turns</span>
          <span style={labelStyle}>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{today?.committed ?? 0}</span>
            <span style={{ color: "#475569" }}> / {data.daily_limit}</span>
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={today?.committed ?? 0}
          aria-valuemin={0}
          aria-valuemax={data.daily_limit}
          aria-label={`Today's usage: ${today?.committed ?? 0} of ${data.daily_limit}`}
          style={progressTrackStyle}
        >
          <div
            style={{
              ...progressFillStyle,
              width: `${todayPct}%`,
              background:
                todayPct >= 90
                  ? "linear-gradient(90deg, #f87171, #ef4444)"
                  : todayPct >= 70
                  ? "linear-gradient(90deg, #fb923c, #f97316)"
                  : "linear-gradient(90deg, #818cf8, #6366f1)",
            }}
          />
        </div>
        {(today?.reserved ?? 0) > 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#475569" }}>
            +{today.reserved} reserved (in-flight)
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div style={gridStyle}>
        <StatCard label="Total committed" value={summary.total_committed} />
        <StatCard label="Daily average" value={summary.avg_daily} />
        <StatCard
          label="Peak day"
          value={summary.peak_day.count}
          sub={formatDate(summary.peak_day.date)}
        />
        <StatCard label="Current streak" value={`${summary.current_streak}d`} accent />
      </div>

      {/* Chart */}
      <div style={{ marginTop: 28 }}>
        <p style={{ ...labelStyle, marginBottom: 12 }}>Daily turns — committed + reserved (stacked)</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={data.days}
            barCategoryGap="30%"
            margin={{ top: 4, right: 0, left: -28, bottom: 0 }}
            stackOffset="none"
          >
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <ReferenceLine
              y={data.daily_limit}
              stroke="#ef4444"
              strokeDasharray="4 2"
              strokeOpacity={0.6}
              label={{ value: "limit", fontSize: 9, fill: "#ef4444", position: "insideTopRight" }}
            />
            {/* committed — bottom segment, color-coded by utilization */}
            <Bar dataKey="committed" stackId="turns" radius={[0, 0, 0, 0]}>
              {data.days.map((d: DayStats) => (
                <Cell key={d.date} fill={barColor(d.utilization)} />
              ))}
            </Bar>
            {/* reserved — top segment, always muted */}
            <Bar dataKey="reserved" stackId="turns" fill="#334155" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div style={legendStyle}>
          <LegendDot color="#818cf8" label="Committed" />
          <LegendDot color="#334155" label="Reserved (in-flight)" />
          <LegendDot color="#fb923c" label="≥70% limit" />
          <LegendDot color="#f87171" label="≥90% limit" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div style={statCardStyle}>
      <p style={{ fontSize: 11, color: "#475569", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </p>
      <p style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", color: accent ? "#818cf8" : "#e2e8f0" }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: "#334155", margin: "2px 0 0" }}>{sub}</p>}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 16,
  padding: 28,
  maxWidth: 740,
  width: "100%",
  fontFamily: "'Inter', system-ui, sans-serif",
  boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 24,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  margin: "0 0 4px",
};

const titleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#e2e8f0",
  margin: 0,
};

const planBadgeStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #312e81, #4338ca)",
  color: "#c7d2fe",
  borderRadius: 20,
  padding: "4px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "capitalize",
  letterSpacing: "0.05em",
  border: "1px solid #4338ca",
};

const progressSectionStyle: React.CSSProperties = {
  background: "#0a0f1e",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "14px 16px",
  marginBottom: 20,
};

const progressTrackStyle: React.CSSProperties = {
  height: 8,
  borderRadius: 4,
  background: "#1e293b",
  overflow: "hidden",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 4,
  transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  margin: 0,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 10,
};

const statCardStyle: React.CSSProperties = {
  background: "#0a0f1e",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "14px 16px",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  marginTop: 10,
  flexWrap: "wrap",
};

const shimmerRow: React.CSSProperties = {
  height: 18,
  borderRadius: 6,
  background: "linear-gradient(90deg, #1e293b 25%, #263348 50%, #1e293b 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s infinite",
  width: "100%",
};

const tooltipStyle: React.CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
};

const selectorStyle: React.CSSProperties = {
  display: "flex",
  background: "#0a0f1e",
  border: "1px solid #1e293b",
  borderRadius: 8,
  padding: 3,
  gap: 2,
};

const selectorBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderRadius: 6,
  color: "#475569",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 10px",
  transition: "background 0.15s, color 0.15s",
};

const selectorBtnActiveStyle: React.CSSProperties = {
  background: "#1e293b",
  color: "#e2e8f0",
};
