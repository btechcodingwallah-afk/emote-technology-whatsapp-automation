// ============================================
// Meta WhatsApp API Type Definitions
// Based on Meta Embedded Signup v4 documentation
// ============================================

// --- Embedded Signup Session Events ---

export type EmbeddedSignupEventType =
  | 'FINISH'
  | 'FINISH_ONLY_WABA'
  | 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
  | 'CANCEL'
  | 'ERROR';

export interface EmbeddedSignupEventData {
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
  ad_account_ids?: string[];
  page_ids?: string[];
  current_step?: string;
}

export interface EmbeddedSignupEvent {
  type: 'WA_EMBEDDED_SIGNUP';
  event: EmbeddedSignupEventType;
  data: EmbeddedSignupEventData;
}

// --- FB.login Response ---

export interface FBAuthResponse {
  code?: string;
  accessToken?: string;
  userID?: string;
  expiresIn?: number;
  signedRequest?: string;
  graphDomain?: string;
  data_access_expiration_time?: number;
}

export interface FBLoginResponse {
  authResponse: FBAuthResponse | null;
  status: 'connected' | 'not_authorized' | 'unknown';
}

// --- Token Exchange ---

export interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
}

// --- Graph API Responses ---

export interface MetaWABAResponse {
  id: string;
  name?: string;
  currency?: string;
  timezone_id?: string;
  message_template_namespace?: string;
  account_review_status?: string;
  business_verification_status?: string;
  ownership_type?: string;
}

export interface MetaPhoneNumberResponse {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  platform_type?: string;
  is_on_biz_app?: boolean;
  code_verification_status?: string;
  name_status?: string;
}

export interface MetaSubscribeResponse {
  success: boolean;
}

export interface MetaRegisterResponse {
  success: boolean;
}

export interface MetaSyncResponse {
  success: boolean;
}

// --- Webhook Types ---

export interface WebhookVerificationQuery {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

export interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: WebhookChangeValue;
  field: string;
}

export interface WebhookChangeValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: WebhookContact[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
  errors?: WebhookError[];
}

export interface WebhookContact {
  profile: { name: string };
  wa_id: string;
}

export interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WebhookMedia;
  audio?: WebhookMedia;
  video?: WebhookMedia;
  document?: WebhookMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: Record<string, unknown>;
  button?: { text: string; payload: string };
  context?: { from: string; id: string };
}

export interface WebhookMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

export interface WebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: WebhookError[];
}

export interface WebhookError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}

// --- Send Message Types ---

export interface SendTextMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: { preview_url?: boolean; body: string };
}

export interface SendTemplateMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: TemplateComponent[];
  };
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: TemplateParameter[];
  sub_type?: string;
  index?: number;
}

export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  [key: string]: unknown;
}

export interface SendMessageResponse {
  messaging_product: string;
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

export interface MarkReadRequest {
  messaging_product: 'whatsapp';
  status: 'read';
  message_id: string;
}

// --- Meta Graph API Error ---

export interface MetaGraphError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// --- Connection Types ---

export type ConnectionType = 'CLOUD_API' | 'COEXISTENCE';

export type ConnectionStatus = 'PENDING' | 'ACTIVE' | 'NEEDS_ACTION' | 'DISCONNECTED' | 'ERROR';

export type OnboardingStatus =
  | 'STARTED'
  | 'META_AUTHORIZED'
  | 'TOKEN_EXCHANGED'
  | 'WABA_SUBSCRIBED'
  | 'PHONE_REGISTERED'
  | 'SYNCING'
  | 'CONNECTED'
  | 'FAILED';
