import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { format, startOfHour } from 'date-fns';
import { toDate } from '../utils/format.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/**
 * Compliance timeline — stacked bar chart binning check-ins by hour and
 * showing compliant vs violation counts. Helps regulators spot when
 * residency began to drift.
 */
export default function ComplianceTimeline({ history = [] }) {
  // Bucket by hour
  const buckets = new Map();
  for (const h of history) {
    const d = toDate(h.timestamp);
    if (!d) continue;
    const key = startOfHour(d).toISOString();
    if (!buckets.has(key)) buckets.set(key, { compliant: 0, violation: 0 });
    const slot = buckets.get(key);
    if (h.status === 'COMPLIANT') slot.compliant += 1;
    else slot.violation += 1;
  }

  const sorted = [...buckets.entries()].sort(
    ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
  );

  const labels = sorted.map(([k]) => format(new Date(k), 'd MMM HH:00'));
  const compliant = sorted.map(([, v]) => v.compliant);
  const violation = sorted.map(([, v]) => v.violation);

  const data = {
    labels,
    datasets: [
      {
        label: 'Compliant',
        data: compliant,
        backgroundColor: '#006b3f',
        borderColor: '#006b3f',
        borderWidth: 0,
        stack: 's',
      },
      {
        label: 'Violation',
        data: violation,
        backgroundColor: '#ce1126',
        borderColor: '#ce1126',
        borderWidth: 0,
        stack: 's',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: { family: "'IBM Plex Mono', monospace", size: 11 },
          color: '#4a4738',
          boxWidth: 12,
          boxHeight: 12,
          padding: 14,
        },
      },
      tooltip: {
        backgroundColor: '#15140f',
        titleFont: { family: "'IBM Plex Mono', monospace", size: 11 },
        bodyFont: { family: "'IBM Plex Sans', sans-serif", size: 12 },
        padding: 10,
        cornerRadius: 0,
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          font: { family: "'IBM Plex Mono', monospace", size: 10 },
          color: '#807c6c',
          maxRotation: 0,
          autoSkipPadding: 16,
        },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: 'rgba(168, 160, 138, 0.25)', drawBorder: false },
        ticks: {
          font: { family: "'IBM Plex Mono', monospace", size: 10 },
          color: '#807c6c',
          precision: 0,
        },
      },
    },
  };

  return (
    <div style={{ height: 240 }}>
      <Bar data={data} options={options} />
    </div>
  );
}
