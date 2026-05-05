import { createEquipmentRetrievalVerificationOrderActivity } from "../activities/cobrancas/create-equipment-retrieval-verification-order.activity.js";
import { fetchEquipmentRetrievalVerificationEligiblesActivity } from "../activities/cobrancas/fetch-equipment-retrieval-verification-eligibles.activity.js";
import { registerEquipmentRetrievalVerificationTriggerFailureActivity } from "../activities/cobrancas/register-equipment-retrieval-verification-trigger-failure.activity.js";
import { fetchCsatEligibleItemsActivity } from "../activities/csat/fetch-csat-eligible-items.activity.js";
import { findOpaCustomerActivity } from "../activities/csat/find-opa-customer.activity.js";
import { findWhatsappContactActivity } from "../activities/csat/find-whatsapp-contact.activity.js";
import { forwardServiceOrderOnFailureActivity } from "../activities/csat/forward-service-order-on-failure.activity.js";
import { registerCsatSuccessEventOnOsActivity } from "../activities/csat/register-csat-success-event-on-os.activity.js";
import { registerCsatTriggerFailureActivity } from "../activities/csat/register-csat-trigger-failure.activity.js";
import { sendCsatMessageActivity } from "../activities/csat/send-csat-message.activity.js";
import { checkNfeEmailDispatchDiscoveryRunningActivity } from "../activities/nfe/check-nfe-email-dispatch-discovery-running.activity.js";
import { enqueueNfeEmailDispatchSalesActivity } from "../activities/nfe/enqueue-nfe-email-dispatch-sales.activity.js";
import { finalizeManualNfeEmailDispatchSaleActivity } from "../activities/nfe/finalize-manual-nfe-email-dispatch-sale.activity.js";
import { claimNfeEmailDispatchSaleActivity } from "../activities/nfe/claim-nfe-email-dispatch-sale.activity.js";
import { fetchCustomerNfeSalesCandidatesFromErpActivity } from "../activities/nfe/fetch-customer-nfe-sales-candidates-from-erp.activity.js";
import { fetchNfePdfFromIxcActivity } from "../activities/nfe/fetch-nfe-pdf-from-ixc.activity.js";
import { fetchNfeSaleEmailContextFromErpActivity } from "../activities/nfe/fetch-nfe-sale-email-context-from-erp.activity.js";
import { finalizeNfeEmailDispatchSaleActivity } from "../activities/nfe/finalize-nfe-email-dispatch-sale.activity.js";
import { loadNfeEmailDispatchSaleForManualProcessingActivity } from "../activities/nfe/load-nfe-email-dispatch-sale-for-manual-processing.activity.js";
import { loadNfeEmailDispatchEligibleSalesActivity } from "../activities/nfe/load-nfe-email-dispatch-eligible-sales.activity.js";
import { loadNfeEmailDispatchCustomersActivity } from "../activities/nfe/load-nfe-email-dispatch-customers.activity.js";
import {
  acquireNfeEmailDispatchSaleAttemptLockActivity,
  cancelNfeEmailDispatchSaleAttemptLockActivity,
  completeNfeEmailDispatchSaleAttemptLockActivity,
} from "../activities/nfe/nfe-email-dispatch-sale-attempt-lock.activity.js";
import { renderNfeEmailTemplateActivity } from "../activities/nfe/render-nfe-email-template.activity.js";
import { diagnosticsPingActivity } from "../activities/shared/diagnostics-ping.activity.js";
import { sendSmtpEmailActivity } from "../activities/shared/send-smtp-email.activity.js";

export const controlWorkerActivities = Object.freeze({
  diagnosticsPingActivity,
  sendSmtpEmailActivity,
  registerCsatTriggerFailureActivity,
  registerEquipmentRetrievalVerificationTriggerFailureActivity,
  loadNfeEmailDispatchCustomersActivity,
  enqueueNfeEmailDispatchSalesActivity,
  loadNfeEmailDispatchEligibleSalesActivity,
  checkNfeEmailDispatchDiscoveryRunningActivity,
  claimNfeEmailDispatchSaleActivity,
  acquireNfeEmailDispatchSaleAttemptLockActivity,
  cancelNfeEmailDispatchSaleAttemptLockActivity,
  completeNfeEmailDispatchSaleAttemptLockActivity,
  loadNfeEmailDispatchSaleForManualProcessingActivity,
  renderNfeEmailTemplateActivity,
  finalizeNfeEmailDispatchSaleActivity,
  finalizeManualNfeEmailDispatchSaleActivity,
});

export const erpReadWorkerActivities = Object.freeze({
  fetchCsatEligibleItemsActivity,
  fetchEquipmentRetrievalVerificationEligiblesActivity,
  fetchCustomerNfeSalesCandidatesFromErpActivity,
  fetchNfeSaleEmailContextFromErpActivity,
});

export const opaWorkerActivities = Object.freeze({
  findOpaCustomerActivity,
  findWhatsappContactActivity,
});

export const ixcWorkerActivities = Object.freeze({
  forwardServiceOrderOnFailureActivity,
  sendCsatMessageActivity,
  registerCsatSuccessEventOnOsActivity,
  createEquipmentRetrievalVerificationOrderActivity,
  fetchNfePdfFromIxcActivity,
});
