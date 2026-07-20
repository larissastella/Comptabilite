import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback(word => [word]);

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1f2937' },
  header: { marginBottom: 24, borderBottomWidth: 2, borderBottomColor: '#10B981', paddingBottom: 12 },
  logo: { fontSize: 18, fontWeight: 'bold', color: '#0F2A3D' },
  subtitle: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  title: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginVertical: 16, color: '#0F2A3D' },
  period: { fontSize: 9, textAlign: 'center', color: '#6b7280', marginBottom: 16 },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  kpiCard: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 },
  kpiLabel: { fontSize: 8, color: '#6b7280', marginBottom: 4 },
  kpiValue: { fontSize: 14, fontWeight: 'bold', color: '#1f2937' },
  table: { marginTop: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tableRowTotal: { flexDirection: 'row', paddingVertical: 6, backgroundColor: '#f9fafb', borderBottomWidth: 2, borderBottomColor: '#d1d5db' },
  cell: { fontSize: 9, paddingHorizontal: 6 },
  cellHeader: { fontSize: 8, fontWeight: 'bold', color: '#6b7280', paddingHorizontal: 6, textTransform: 'uppercase' },
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#9ca3af' },
});

interface ReportPdfProps {
  tenantName: string;
  title: string;
  period: string;
  kpis: Array<{ label: string; value: string }>;
  columns: string[];
  rows: Array<Array<string | number>>;
  totalRow?: Array<string | number>;
  currency: string;
}

export function ReportPdfDocument({ tenantName, title, period, kpis, columns, rows, totalRow, currency }: ReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>{tenantName}</Text>
          <Text style={styles.subtitle}>LiAfrik Books — Rapport comptable</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.period}>Période: {period}</Text>

        {/* KPI cards */}
        {kpis.length > 0 && (
          <View style={styles.kpiRow}>
            {kpis.map((kpi, i) => (
              <View key={i} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
                <Text style={styles.kpiValue}>{kpi.value} {currency}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            {columns.map((col, i) => (
              <Text key={i} style={[styles.cellHeader, { flex: i === 0 ? 1.5 : i >= columns.length - 2 ? 1 : 2 }]}>{col}</Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.tableRow}>
              {row.map((cell, ci) => (
                <Text
                  key={ci}
                  style={[styles.cell, {
                    flex: ci === 0 ? 1.5 : ci >= columns.length - 2 ? 1 : 2,
                    textAlign: ci >= columns.length - 2 ? 'right' : 'left',
                  }]}
                >
                  {typeof cell === 'number' ? cell.toLocaleString('fr-FR') : cell}
                </Text>
              ))}
            </View>
          ))}
          {totalRow && (
            <View style={styles.tableRowTotal}>
              {totalRow.map((cell, ci) => (
                <Text
                  key={ci}
                  style={[styles.cell, {
                    flex: ci === 0 ? 1.5 : ci >= columns.length - 2 ? 1 : 2,
                    textAlign: ci >= columns.length - 2 ? 'right' : 'left',
                    fontWeight: 'bold',
                  }]}
                >
                  {typeof cell === 'number' ? cell.toLocaleString('fr-FR') : cell}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Genéré le {new Date().toLocaleDateString('fr-FR')}</Text>
          <Text>LiAfrik Books — Page 1</Text>
        </View>
      </Page>
    </Document>
  );
}
