import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { format } from 'date-fns';
import { toDate } from '../utils/format.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

/**
 * Latency trend chart — plots RTT over time for a single server.
 * Overlays the domestic threshold (from /api/config) as a horizontal rule.
 */
export default function LatencyChart({ history = [], threshold = 50 }) {
  const ordered = [...history].sort(
    (a, b) => (toDate(a.timestamp)?.getTime() || 0) - (toDate(b.timestamp)?.getTime() || 0),
  );

  const labels = ordered.map((h) => {
    const d = toDate(h.timestamp);
    return d ? format(d, 'd MMM HH:mm') : '';
  });

  const rttData = ordered.map((h) => (h.rtt != null ? Number(h.rtt) : null));

  const colors = ordered.map((h) =>
    h.status === 'COMPLIANT' ? '#006b3f' : '#ce1126',
  );

  const data = {
    labels,
    datasets: [
      {
        label: 'RTT (ms)',
        data: rttData,
        borderColor: '#15140f',
        backgroundColor: 'rgba(21, 20, 15, 0.06)',
        fill: true,
        tension: 0.25,
        pointBackgroundColor: colors,
        pointBorderColor: '#f7f3ea',
        pointBorderWidth: 1.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 1.5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#15140f',
        titleFont: { family: "'IBM Plex Mono', monospace", size: 11 },
        bodyFont: { family: "'IBM Plex Sans', sans-serif", size: 12 },
        padding: 10,
        cornerRadius: 0,
      },
      annotation: undefined,
    },
    scales: {
      x: {
        grid: { color: 'rgba(168, 160, 138, 0.25)', drawBorder: false },
        ticks: {
          font: { family: "'IBM Plex Mono', monospace", size: 10 },
          color: '#807c6c',
          maxRotation: 0,
          autoSkipPadding: 16,
        },
      },
      y: {
        beginAtZero: true,
        suggestedMax: Math.max(threshold * 2, ...rttData.filter((x) => x != null), 60),
        grid: { color: 'rgba(168, 160, 138, 0.25)', drawBorder: false },
        ticks: {
          font: { family: "'IBM Plex Mono', monospace", size: 10 },
          color: '#807c6c',
          callback: (v) => `${v} ms`,
        },
      },
    },
  };

  // Draw the threshold line manually via a Chart.js plugin definition inlined.
  const thresholdPlugin = {
    id: 'thresholdLine',
    afterDraw(chart) {
      const {
        ctx,
        chartArea: { left, right },
        scales: { y },
      } = chart;
      const yPos = y.getPixelForValue(threshold);
      ctx.save();
      ctx.strokeStyle = '#c89b15';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, yPos);
      ctx.lineTo(right, yPos);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#c89b15';
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.fillText(`Threshold ${threshold} ms`, left + 6, yPos - 4);
      ctx.restore();
    },
  };

  return (
    <div style={{ height: 280 }}>
      <Line data={data} options={options} plugins={[thresholdPlugin]} />
    </div>
  );
}
