/**
 * 订阅模块的公开入口。
 *
 * 订阅的生命周期（Checkout、支付事件、账单查询）属于业务，不属于基础设施：
 * `core/payment` 只留**渠道边界**（provider 接口与实现、价格目录），
 * 「订阅」这件事由本模块负责。跨模块只能从这里取东西。
 */
export {
  type AdminBillingResult,
  type AdminSubscription,
  fetchAdminBilling,
} from './admin-billing'
export {
  type AdminOrder,
  type AdminOrderStatusFilter,
  type AdminOrdersQuery,
  type AdminOrdersResult,
  type AdminRefundResult,
  fetchAdminOrders,
  queryAdminOrders,
  refundAdminOrder,
} from './admin-orders'
export {
  type AdminPaymentRow,
  type RevenueBucket,
  type RevenueSummary,
  summarizeRevenue,
} from './admin-query'
export {
  type AdminSubscriptionItem,
  type AdminSubscriptionStatusFilter,
  type AdminSubscriptionsQuery,
  type AdminSubscriptionsResult,
  fetchAdminSubscriptions,
  queryAdminSubscriptions,
} from './admin-subscriptions'
export {
  type BillingOverview,
  type CancelSubscriptionResult,
  cancelMySubscription,
  fetchBillingOverview,
  fetchCurrentPlan,
} from './billing'
export { beginCheckout, findCustomerId } from './checkout'
export { applyPaymentEvent } from './events'
export { ACTIVE_SUBSCRIPTION_STATUSES, occupiesSubscriptionSlot } from './plan-state'
export {
  type PaymentRecord,
  paymentStatusMessageKey,
  productNameForProductId,
  type SubscriptionRecord,
  splitBillingDisplay,
  subscriptionIntervalMessageKey,
  subscriptionStatusMessageKey,
} from './query'
