import { useOptionalPortalTheme } from "../shared/portal-theme";
import { studentPortalChartTheme } from "./student-portal-chart-theme";

type Props = {
  percentage: number | null;
  label: string;
  sublabel?: string;
  size?: number;
  stroke?: number;
};

/** SVG progress ring — ERP blue in light mode; neutral in dark mode. */
export function StudentAttendanceProgressRing({ percentage, label, sublabel, size = 140, stroke = 10 }: Props) {
  const portalTheme = useOptionalPortalTheme();
  const chart = studentPortalChartTheme(portalTheme?.mode ?? "light");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = percentage === null ? 0 : Math.min(100, Math.max(0, percentage));
  const dash = (pct / 100) * c;
  const track = chart.ringTrack;
  const fill = chart.ringFill;

  return (
    <div className="sp-att-ring-wrap">
      <div className="sp-att-ring-svg" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={fill}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="sp-att-ring-arc"
          />
        </svg>
        <div className="sp-att-ring-center">
          <span className="sp-att-ring-pct">{percentage === null ? "—" : `${percentage}%`}</span>
        </div>
      </div>
      <p className="sp-att-ring-label">{label}</p>
      {sublabel ? <p className="sp-att-ring-sub">{sublabel}</p> : null}
    </div>
  );
}
