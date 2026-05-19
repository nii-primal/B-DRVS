import { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download } from 'lucide-react';
import { fmtDateTime, fmtRtt, shortHash } from '../utils/format.js';

/**
 * Generates a formatted PDF evidence report for the given server.
 *
 * The report contains:
 *  - Cover header (Republic of Ghana, MoH, B-DRVS)
 *  - Server identity & latest status
 *  - Compliance summary
 *  - Full audit trail table
 *  - Cryptographic verification block (payload hashes, signatures)
 *  - Issuance metadata (UTC timestamp, channel, generator)
 *
 * This satisfies the Section 3.5.3 evidence-export requirement: a
 * portable, formatted package suitable for DPC investigations or
 * contractual dispute resolution.
 */
export default function EvidenceExport({ server, history = [], stats }) {
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 48;
      let y = margin;

      // --- Cover ---------------------------------------------------------
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text('REPUBLIC OF GHANA · MINISTRY OF HEALTH', margin, y);
      y += 14;

      doc.setFontSize(20);
      doc.setTextColor(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Data Residency Verification Report', margin, y);
      y += 26;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(
        'Issued under the Data Protection Act, 2012 (Act 843) of the Republic of Ghana.',
        margin,
        y,
      );
      y += 14;
      doc.text(
        'This report constitutes tamper-evident evidence of recorded data residency check-ins',
        margin,
        y,
      );
      y += 12;
      doc.text(
        'against the B-DRVS permissioned blockchain ledger (Hyperledger Fabric).',
        margin,
        y,
      );
      y += 24;

      doc.setDrawColor(150);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 18;

      // --- Subject summary ----------------------------------------------
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text('Subject', margin, y);
      y += 16;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const subjectLines = [
        ['Server ID', server?.serverID || '—'],
        ['Latest status', server?.status || '—'],
        ['Last observed IP', server?.ipAddress || '—'],
        ['Last RTT', fmtRtt(server?.rtt)],
        ['Last check-in', fmtDateTime(server?.timestamp)],
      ];
      subjectLines.forEach(([k, v]) => {
        doc.setTextColor(110);
        doc.text(k, margin, y);
        doc.setTextColor(20);
        doc.text(String(v), margin + 130, y);
        y += 14;
      });
      y += 8;

      // --- Compliance summary -------------------------------------------
      if (stats) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Compliance summary', margin, y);
        y += 16;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const sumLines = [
          ['Total check-ins', stats.totalCheckins ?? history.length],
          ['Compliant', stats.compliantCount ?? history.filter((h) => h.status === 'COMPLIANT').length],
          [
            'Violations',
            stats.violationCount ??
              history.filter((h) => h.status !== 'COMPLIANT').length,
          ],
          ['Average RTT', stats.averageRTT ? `${Number(stats.averageRTT).toFixed(1)} ms` : '—'],
          ['Compliance rate', stats.complianceRate ? `${Number(stats.complianceRate).toFixed(2)} %` : '—'],
        ];
        sumLines.forEach(([k, v]) => {
          doc.setTextColor(110);
          doc.text(String(k), margin, y);
          doc.setTextColor(20);
          doc.text(String(v), margin + 130, y);
          y += 14;
        });
        y += 8;
      }

      // --- Audit trail table --------------------------------------------
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Audit trail', margin, y);
      y += 8;

      autoTable(doc, {
        startY: y + 6,
        head: [['Timestamp (UTC)', 'Status', 'IP address', 'RTT', 'Payload hash']],
        body: history.map((h) => [
          fmtDateTime(h.timestamp),
          h.status || '—',
          h.ipAddress || '—',
          fmtRtt(h.rtt),
          shortHash(h.payloadHash, 12, 8),
        ]),
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 5,
          textColor: 30,
          lineColor: 200,
          lineWidth: 0.25,
        },
        headStyles: {
          fillColor: [21, 20, 15],
          textColor: 247,
          fontStyle: 'bold',
          halign: 'left',
        },
        alternateRowStyles: { fillColor: [248, 244, 235] },
        margin: { left: margin, right: margin },
      });

      let finalY = doc.lastAutoTable.finalY + 24;

      // New page if needed
      if (finalY > doc.internal.pageSize.getHeight() - 140) {
        doc.addPage();
        finalY = margin;
      }

      // --- Cryptographic verification ----------------------------------
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text('Cryptographic verification', margin, finalY);
      finalY += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80);
      const verifLines = [
        'Each record above was signed by the registered probing agent using ECDSA over the',
        'P-256 curve (SHA-256). The hash column contains the SHA-256 digest of the signed',
        'payload as committed to the bdrvschannel ledger. Records were endorsed by peers from',
        'both MoHMSP and NITAMSP and may be re-verified by reading the corresponding block',
        'directly from the Hyperledger Fabric peers.',
      ];
      verifLines.forEach((line) => {
        doc.text(line, margin, finalY);
        finalY += 12;
      });
      finalY += 8;

      // --- Issuance footer ----------------------------------------------
      doc.setDrawColor(150);
      doc.line(margin, finalY, pageW - margin, finalY);
      finalY += 14;
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(`Generated: ${new Date().toUTCString()}`, margin, finalY);
      finalY += 11;
      doc.text('Channel: bdrvschannel · Chaincode: residency v1.0', margin, finalY);
      finalY += 11;
      doc.text(
        'B-DRVS prototype · University of Mines and Technology, Tarkwa',
        margin,
        finalY,
      );

      // Page numbers
      const total = doc.internal.getNumberOfPages();
      for (let i = 1; i <= total; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${i} of ${total}`,
          pageW - margin,
          doc.internal.pageSize.getHeight() - 24,
          { align: 'right' },
        );
      }

      const fname = `bdrvs-evidence_${(server?.serverID || 'unknown')
        .replace(/[^a-z0-9-_]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fname);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn"
      onClick={generate}
      disabled={busy || !server}
      aria-busy={busy}
    >
      <Download size={14} />
      {busy ? 'Generating…' : 'Export evidence report'}
    </button>
  );
}
