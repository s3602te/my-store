import type { InvoiceProvider } from './InvoiceProvider.js'
import { NoopInvoiceProvider } from './NoopInvoiceProvider.js'

export type { InvoiceProvider } from './InvoiceProvider.js'

/** 目前使用的發票提供者(不開發票)。日後串接電子發票服務時,改成對應的實作即可 */
export const invoiceProvider: InvoiceProvider = new NoopInvoiceProvider()
