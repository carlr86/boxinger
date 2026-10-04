export type Client = {
  account_id: string; name: string; email: string; owner_id: string; account_name: string; created_at: string; status: 'active' | 'suspended';
  last_activity_at: string; login: string; activated: boolean; invite: 'no' | 'sent' | null; plan: 'Pro' | 'Free' | 'Enterprise';
  sub_status: string; provider: string | null; currency: 'USD' | 'ARS'; list_amount: number; amount: number;
  deal_type: 'pct' | 'fixed' | null; deal_value: number | null; deal_until: string | null; deal_note: string | null;
  pro_since: string | null; free_since: string | null; current_period_end: string | null; cancel_at_period_end: boolean;
  boards: number; first_board: { id: string; name: string; slug: string } | null; ideas: number; guests: number;
};
export type ClientDetail = Client & {
  billed: number; billed_ars: number; activation_token: string | null;
  cancel?: { reason: string | null; note: string | null; at: string } | null;
  payments: { provider: string; amount: number; refunded_amount?: number; currency: string; status: string; paid_at: string | null }[];
  board_list: { id: string; name: string; slug: string; visibility: string; status: string; team_name: string; ideas: number; guests: number; members: number; created_at: string; last_activity_at: string }[];
};
export type AdminBoard = {
  board_id: string; name: string; slug: string; visibility: string; status: 'active' | 'suspended'; account_id: string;
  owner_name: string; owner_email: string; team_name: string; plan: 'Pro' | 'Free' | 'Enterprise'; ideas: number; guests: number; created_at: string; last_activity_at: string;
};
export type AdminUser = {
  user_id: string; name: string; email: string; status: 'active' | 'blocked'; created_at: string; last_seen_at: string | null;
  role: string; board: { id: string; name: string; slug: string } | null; boards_count: number;
};
export type Overview = {
  accounts: number; active_boards: number; ideas: number; votes: number; comments: number;
  recent_boards: { board_id: string; name: string; slug: string; account_id: string; plan: string; ideas: number; last_activity_at: string }[];
  pro: Client[]; enterprise: number; prices: { USD: number; ARS: number };
};
export type Prices = {
  current: { USD: number; ARS: number }; current_since: { USD: string; ARS: string }; pro_count: { USD: number; ARS: number };
  rows: { id: string; currency: 'USD' | 'ARS'; amount: number; effective_from: string; scope: 'all' | 'new'; notify: boolean; applied_at: string | null; state: 'current' | 'scheduled' | 'previous' }[];
};
