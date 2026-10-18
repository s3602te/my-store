import type { InvoiceProvider, InvoiceResult, IssueInvoiceInput } from './InvoiceProvider.js'

/** 「不開發票」的實作:每次都回報 NOT_REQUIRED,不連任何外部服務。 */
export class NoopInvoiceProvider implements InvoiceProvider {
  readonly name = 'none'

  async issue(_input: IssueInvoiceInput): Promise<InvoiceResult> {
    return { provider: this.name, status: 'NOT_REQUIRED', invoiceNumber: null }
  }

  async void(_invoiceNumber: string, _reason: string): Promise<InvoiceResult> {
    return { provider: this.name, status: 'NOT_REQUIRED', invoiceNumber: null }
  }
}
