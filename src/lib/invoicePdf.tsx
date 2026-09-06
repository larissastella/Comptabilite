import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback(word => [word]);

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2937' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo: { height: 48, maxWidth: 160, objectFit: 'contain', marginBottom: 8 },
  companyName: { fontSize: 16, fontWeight: 'bold', color: '#0F2A3D' },
  legalLine: { fontSize: 8, color: '#6b7280', marginTop: 1 },
  invoiceTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F2A3D', textAlign: 'right' },
  invoiceNumber: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#0057D9', textAlign: 'right', marginTop: 4 },
  dateLine: { fontSize: 8, color: '#6b7280', textAlign: 'right', marginTop: 2 },
  billToBox: { backgroundColor: '#f9fafb', borderRadius: 6, padding: 10, marginBottom: 20, maxWidth: 260 },
  billToLabel: { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 },
  billToName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111827' },
  billToLine: { fontSize: 8, color: '#6b7280', marginTop: 1 },
  table: { marginBottom: 20 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#0F2A3D', paddingBottom: 6 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 6 },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 1.3, textAlign: 'right' },
  colVat: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 1.4, textAlign: 'right' },
  headerCell: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#0F2A3D', textTransform: 'uppercase' },
  cell: { fontSize: 8.5, color: '#374151' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  notesBox: { maxWidth: 260 },
  notesLabel: { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 },
  notesText: { fontSize: 8, color: '#4b5563', marginBottom: 8 },
  totalsBox: { minWidth: 200 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { fontSize: 8.5, color: '#6b7280' },
  totalValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#374151' },
  grandTotalLine: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#0F2A3D', paddingTop: 6, marginTop: 4 },
  grandTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0F2A3D' },
  grandTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0057D9' },
  stamp: { height: 70, objectFit: 'contain', marginTop: 24, alignSelf: 'flex-end' },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, textAlign: 'center', fontSize: 7.5, color: '#9ca3af', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 },
});

interface InvoicePdfProps {
  tenant: {
    name: string;
    logo_url?: string;
    cachet_url?: string;
    legal_nif?: string;
    legal_rccm?: string;
    legal_regime?: string;
    city?: string;
    phone_prefix?: string;
    bank_details?: Record<string, string>;
  };
  invoice: {
    invoice_number: string;
    invoice_date: string;
    due_date?: string;
    status: string;
    subtotal: number;
    discount_amount: number;
    vat_amount: number;
    total: number;
    amount_paid: number;
    balance_due: number;
    notes?: string;
    terms?: string;
  };
  customer?: {
    name: string;
    tax_id?: string;
    address?: string;
    city?: string;
    email?: string;
    phone?: string;
  } | null;
  items: {
    description: string;
    quantity: number;
    unit_price: number;
    discount_pct: number;
    vat_rate: number;
    subtotal: number;
    total: number;
  }[];
  formatCurrency: (n: number) => string;
  formatDate: (iso: string) => string;
  statusLabel: string;
}

/**
 * Mirrors the on-screen invoice in InvoiceDetail.tsx exactly — same
 * fields, same branding source (tenant.logo_url / tenant.cachet_url,
 * whatever the company uploaded in Settings), so what a customer
 * receives as a PDF or email attachment is the same document they'd see
 * printed from the app, not a separate, out-of-sync template.
 */
export function InvoicePdfDocument({ tenant, invoice, customer, items, formatCurrency, formatDate, statusLabel }: InvoicePdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {tenant.logo_url && <Image src={tenant.logo_url} style={styles.logo} />}
            <Text style={styles.companyName}>{tenant.name}</Text>
            {tenant.legal_nif && <Text style={styles.legalLine}>NIF: {tenant.legal_nif}</Text>}
            {tenant.legal_rccm && <Text style={styles.legalLine}>RCCM: {tenant.legal_rccm}</Text>}
            {tenant.legal_regime && <Text style={styles.legalLine}>Régime: {tenant.legal_regime}</Text>}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>FACTURE</Text>
            <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
            <Text style={styles.dateLine}>Date: {formatDate(invoice.invoice_date)}</Text>
            {invoice.due_date && <Text style={styles.dateLine}>Échéance: {formatDate(invoice.due_date)}</Text>}
            <Text style={styles.dateLine}>Statut: {statusLabel}</Text>
          </View>
        </View>

        {customer && (
          <View style={styles.billToBox}>
            <Text style={styles.billToLabel}>Facturé à</Text>
            <Text style={styles.billToName}>{customer.name}</Text>
            {customer.tax_id && <Text style={styles.billToLine}>NIF: {customer.tax_id}</Text>}
            {customer.address && <Text style={styles.billToLine}>{customer.address}</Text>}
            {customer.city && <Text style={styles.billToLine}>{customer.city}</Text>}
            {customer.email && <Text style={styles.billToLine}>{customer.email}</Text>}
            {customer.phone && <Text style={styles.billToLine}>{customer.phone}</Text>}
          </View>
        )}

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.headerCell, styles.colQty]}>Qté</Text>
            <Text style={[styles.headerCell, styles.colPrice]}>Prix unit.</Text>
            <Text style={[styles.headerCell, styles.colVat]}>TVA</Text>
            <Text style={[styles.headerCell, styles.colTotal]}>Total TTC</Text>
          </View>
          {items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.cell, styles.colDesc]}>{item.description}</Text>
              <Text style={[styles.cell, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.cell, styles.colPrice]}>{formatCurrency(item.unit_price)}</Text>
              <Text style={[styles.cell, styles.colVat]}>{item.vat_rate}%</Text>
              <Text style={[styles.cell, styles.colTotal]}>{formatCurrency(item.total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.notesBox}>
            {invoice.notes && (
              <>
                <Text style={styles.notesLabel}>Notes</Text>
                <Text style={styles.notesText}>{invoice.notes}</Text>
              </>
            )}
            {invoice.terms && (
              <>
                <Text style={styles.notesLabel}>Conditions</Text>
                <Text style={styles.notesText}>{invoice.terms}</Text>
              </>
            )}
            {tenant.bank_details?.iban && (
              <>
                <Text style={styles.notesLabel}>Coordonnées bancaires</Text>
                <Text style={styles.notesText}>IBAN: {tenant.bank_details.iban}</Text>
              </>
            )}
          </View>

          <View style={styles.totalsBox}>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Sous-total HT</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.subtotal)}</Text>
            </View>
            {invoice.discount_amount > 0 && (
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Remise</Text>
                <Text style={styles.totalValue}>-{formatCurrency(invoice.discount_amount)}</Text>
              </View>
            )}
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>TVA</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.vat_amount)}</Text>
            </View>
            <View style={styles.grandTotalLine}>
              <Text style={styles.grandTotalLabel}>Total TTC</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(invoice.total)}</Text>
            </View>
            {invoice.amount_paid > 0 && (
              <>
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabel}>Payé</Text>
                  <Text style={styles.totalValue}>{formatCurrency(invoice.amount_paid)}</Text>
                </View>
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabel}>Solde dû</Text>
                  <Text style={styles.totalValue}>{formatCurrency(invoice.balance_due)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {tenant.cachet_url && <Image src={tenant.cachet_url} style={styles.stamp} />}

        <Text style={styles.footer}>
          {tenant.name}{tenant.legal_nif ? ` · NIF: ${tenant.legal_nif}` : ''}{tenant.city ? ` · ${tenant.city}` : ''}{tenant.phone_prefix ? ` · ${tenant.phone_prefix}` : ''}
        </Text>
      </Page>
    </Document>
  );
}
