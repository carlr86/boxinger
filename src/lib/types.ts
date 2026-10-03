// Shapes returned by the Postgres RPC functions (supabase/migrations/*_api.sql).

export type Role = 'admin' | 'member' | 'guest' | 'blocked' | 'super' | null;
export type IdeaStatus = 'pendiente' | 'en_revision' | 'aprobada' | 'rechazada';
export type VoteValue = 'importante' | 'interesante' | 'no_importante';

export interface Category { id: string; name: string; key: string | null }

export interface Idea {
  id: number;
  board_id: string;
  title: string;
  description: string;
  category_id: string;
  origin: 'equipo' | 'comunidad';
  status: IdeaStatus;
  reject_reason: string | null;
  approved_at: string | null;
  hidden: boolean;
  created_at: string;
  author_id: string | null;
  author_name: string;
  author_avatar?: string | null;
  votes: number;
  comments: number;
  my_vote: VoteValue | null;
  rank: number | null;
  // team only
  importante?: number;
  interesante?: number;
  no_importante?: number;
  score?: number;
  impact?: number;
  effort?: number;
  rm_col?: string | null;
  rm_order?: number | null;
  priority?: 'alta' | 'media' | 'baja' | null;
  dev_status?: 'por_empezar' | 'en_curso' | 'lanzada';
  dev_at?: string | null;
  launched_at?: string | null;
  chk_design?: boolean;
  chk_prd?: boolean;
  growth?: string[];
}

export interface Reply {
  id: number; author_id: string | null; author_name: string; body: string; edited: boolean; created_at: string;
  likes: number; dislikes: number; my_reaction: 'like' | 'no_like' | null;
}
export interface Comment {
  id: number; author_id: string | null; author_name: string; author_avatar: string | null; author_team: boolean;
  body: string | null; deleted: boolean; edited: boolean; hidden: boolean; created_at: string;
  likes: number; dislikes: number; my_reaction: 'like' | 'no_like' | null; reply: Reply | null;
}
export interface IdeaDetail extends Idea {
  board_slug: string;
  comment_list: Comment[];
  history: { from: IdeaStatus; to: IdeaStatus; at: string; reason: string | null }[] | null;
}

export type Visibility = 'public' | 'invite' | 'private';

export interface BoardInfo {
  id: string; name: string; slug: string; description: string; logo_url: string | null;
  visibility: Visibility; status: 'active' | 'suspended'; color: string;
  roadmap_names: Record<string, string>; team_id: string; team_name: string;
  account_status: 'active' | 'suspended'; locked: boolean; pro: boolean; created_at: string;
  invite_code: string | null; guests: number; version: string;
  created_by: string | null; members_can_create_ideas: boolean; guests_can_create_ideas: boolean;
  allowed_domains: string[] | null; // only for whoever can manage the board
  guests_can_view_roadmap: boolean; // effective (setting on, Pro, not private)
  roadmap_setting: boolean; // the raw board setting
  takes_requests: boolean; // invite-only + Pro: people without access can ask to join
  pending_requests: number | null; // only for whoever manages the board
}
export interface BoardData {
  forbidden?: boolean;
  visibility?: Visibility; // with forbidden
  signed_in?: boolean; // with forbidden
  can_request?: boolean; // with forbidden: the board takes access requests
  request?: 'pending' | 'rejected' | null; // with forbidden: my latest request
  board: BoardInfo;
  role: Role;
  joined?: boolean; // has a board_guests row
  me: { id: string; name: string; email: string; avatar_url: string | null; is_super_admin: boolean } | null;
  categories: Category[];
  ideas: Idea[];
  perms?: { can_manage: boolean; can_create_ideas: boolean };
}

export interface BoardCard {
  id: string; name: string; slug: string; description: string; logo_url: string | null;
  visibility: Visibility; status: string; color: string; team_id: string; team_name: string;
  created_at: string; last_activity_at: string; ideas: number; guests: number; fav: boolean;
  locked: boolean; account_status: string; role: Role; joined_at?: string;
}
export interface Person { id?: string; user_id?: string; name: string; email: string; avatar_url?: string | null; role?: string }
export interface TeamCtx {
  id: string; name: string; color: string; account_id: string; created_at: string;
  own: boolean; is_admin: boolean; pro: boolean; plan: 'free' | 'pro' | 'enterprise'; locked: boolean;
  members_can_create_boards: boolean; can_create_boards: boolean;
  owner: Person; members: Person[]; pending: { id: string; email: string }[]; boards: BoardCard[];
}
export interface Subscription {
  account_id: string; plan: 'free' | 'pro' | 'enterprise'; status: string; provider: 'paypal' | 'mercadopago' | 'manual' | null;
  provider_subscription_id: string | null; currency: 'USD' | 'ARS'; list_amount: number | null; charged_amount: number | null;
  pro_since: string | null; free_since: string; current_period_end: string | null; cancel_at_period_end: boolean;
  deal_type: 'pct' | 'fixed' | null; deal_value: number | null; deal_until: string | null; effective_amount: number;
}
export interface MyContext {
  unread_notifications?: number;
  me: {
    id: string; name: string; email: string; avatar_url: string | null; is_super_admin: boolean; status: string;
    notif: Record<string, boolean>; admin_notif: Record<string, boolean>; created_at: string; providers: string[];
    onboarding_skipped?: boolean;
  };
  account: { id: string; name: string; status: string; created_at: string; pro: boolean; plan: 'free' | 'pro' | 'enterprise'; member_limit: number | null; subscription: Subscription } | null;
  teams: TeamCtx[];
  guest_boards: BoardCard[];
  prices: { USD: number; ARS: number };
}
