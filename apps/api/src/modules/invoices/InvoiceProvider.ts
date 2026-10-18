/**
 * 電子發票「提供者」介面(預留,目前不串接)。
 *
 * 目前營業額不需要開立發票,所以 MVP 只使用 NoopInvoiceProvider(什麼都不做)。
 * 日後要串接電子發票服務(例如綠界、ezPay):新增一個實作這個介面的檔案即可。
 */

export type InvoiceStatus = 'NOT_REQUIRED' | 'PENDING' | 'ISSUED' | 'VOIDED'

export interface IssueInvoiceInput {
  orderId: string
  /** 發票金額(新台幣元,整數) */
  total: number
  /** 買受人統一編號(可空) */
  buyerTaxId?: string | null
  /** 載具(可空) */
  carrier?: string | null
}

export interface InvoiceResult {
  provider: string
  status: InvoiceStatus
  invoiceNumber: string | null
}

export interface InvoiceProvider {
  readonly name: string
  /** 開立發票 */
  issue(input: IssueInvoiceInput): Promise<InvoiceResult>
  /** 作廢發票 */
  void(invoiceNumber: string, reason: string): Promise<InvoiceResult>
}
