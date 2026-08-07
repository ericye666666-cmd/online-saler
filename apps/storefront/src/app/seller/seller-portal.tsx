"use client";

import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Eye,
  Gift,
  House,
  Link2,
  LogOut,
  MessageCircle,
  PackageCheck,
  Share2,
  ShoppingBag,
  Sparkles,
  WalletCards,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import type { SellerDashboardData, SellerOrder, SellerRewardStatus } from "../../seller/seller-dashboard-service";
import styles from "./seller-portal.module.css";

type SellerView = "home" | "share" | "sales" | "rewards";

const sellerNavItems = [
  { id: "home", label: "Home", icon: House },
  { id: "share", label: "Share", icon: Share2 },
  { id: "sales", label: "Orders", icon: ClipboardList },
  { id: "rewards", label: "Rewards", icon: WalletCards }
] as const;

const rewardLabels: Record<SellerRewardStatus, string> = {
  Pending: "Pending review",
  Available: "Available",
  Paid: "Paid",
  Rejected: "Rejected"
};

export function SellerPortal({
  initialDashboard,
  isAuthenticated,
  loginHref,
  joinHref
}: {
  initialDashboard: SellerDashboardData | null;
  isAuthenticated: boolean;
  loginHref: string;
  joinHref: string;
}) {
  const [dashboard] = useState<SellerDashboardData | null>(initialDashboard);
  const [activeView, setActiveView] = useState<SellerView>("home");
  const [copied, setCopied] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  async function copySellerLink() {
    if (!dashboard) return;
    const shareLink = new URL(dashboard.shareUrl, window.location.origin).toString();
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareSellerCatalog() {
    if (!dashboard) return;
    const shareLink = new URL(dashboard.shareUrl, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Direct Loop Catalog",
          text: "Browse today's available Direct Loop products.",
          url: shareLink
        });
        return;
      } catch {
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareLink)}`, "_blank", "noopener,noreferrer");
  }

  if (!dashboard) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginStory}>
          <Link className={styles.loginBrand} href="/">Direct Loop</Link>
          <div className={styles.storyContent}>
            <span className={styles.eyebrow}><Sparkles size={16} /> Seller Portal</span>
            <h1>Share products.<br />Track verified rewards.</h1>
            <p>Promotion is invitation-based. Apply first, then the Operations team opens your seller dashboard on your Google account.</p>
            <div className={styles.storySteps}>
              <div><Share2 size={19} /><span><strong>Share your link</strong><small>Every catalog or product link keeps your Affiliate ID.</small></span></div>
              <div><ShoppingBag size={19} /><span><strong>Customer buys on Direct Loop</strong><small>The customer pays the platform through checkout.</small></span></div>
              <div><WalletCards size={19} /><span><strong>Track commission</strong><small>Paid orders appear here after attribution.</small></span></div>
            </div>
          </div>
          <small className={styles.loginFootnote}>Kikuyu warehouse - single-level affiliate promotion</small>
        </section>

        <section className={styles.loginPanel}>
          <div className={styles.loginCard}>
            <div className={styles.loginMark}>DL</div>
            <div>
              <h2>{isAuthenticated ? "Seller access pending" : "Join seller"}</h2>
              <p>{isAuthenticated ? "Your Google account is logged in, but Operations has not opened seller access for it yet." : "Sign in with Google first, then apply for seller access."}</p>
            </div>
            <Link className={styles.signInButton} href={isAuthenticated ? joinHref : loginHref}>
              <ArrowRight size={19} />
              {isAuthenticated ? "Apply or contact support" : "Continue with Google"}
            </Link>
            <Link className={styles.sitesAccessLink} href={joinHref}><Sparkles size={17} /> How to become a seller</Link>
            <a className={styles.helpLink} href={supportWhatsappUrl()} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Contact Direct Loop</a>
          </div>
        </section>
      </main>
    );
  }

  const maxDaily = Math.max(1, ...dashboard.dailyActivity.map((day) => day.referralVisits));
  const firstName = dashboard.seller.displayName.split(" ")[0] || "Seller";
  const sellerContact = dashboard.seller.phone || dashboard.seller.email || "Seller account";

  return (
    <main className={styles.dashboardPage}>
      <header className={styles.appHeader}>
        <Link className={styles.dashboardBrand} href="/">Direct Loop <span>Seller</span></Link>
        <div className={styles.mobileIdentity}><span>{dashboard.seller.displayName.slice(0, 1).toUpperCase()}</span><strong>{firstName}</strong></div>
      </header>

      <div className={styles.sellerAppShell}>
        <aside className={styles.sellerSidebar}>
          <div className={styles.sidebarIdentity}>
            <span>{dashboard.seller.displayName.slice(0, 1).toUpperCase()}</span>
            <p><strong>{dashboard.seller.displayName}</strong><small>{dashboard.seller.refCode}<br />{sellerContact}</small></p>
          </div>
          <SellerNavigation activeView={activeView} onNavigate={setActiveView} />
          <div className={styles.sidebarSupport}>
            <small>Need help?</small>
            <a href={supportWhatsappUrl()} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Contact Direct Loop</a>
          </div>
          <button className={styles.sidebarSignOut} type="button" onClick={() => void signOut()}><LogOut size={17} /> Sign out</button>
        </aside>

        <div className={styles.sellerWorkspace}>
          {activeView === "home" ? <SellerHome dashboard={dashboard} firstName={firstName} onNavigate={setActiveView} /> : null}
          {activeView === "share" ? <SellerShare dashboard={dashboard} copied={copied} maxDaily={maxDaily} onCopy={copySellerLink} onShare={shareSellerCatalog} /> : null}
          {activeView === "sales" ? <SellerSales orders={dashboard.orders} /> : null}
          {activeView === "rewards" ? <SellerRewards dashboard={dashboard} /> : null}
        </div>
      </div>

      <div className={styles.mobileBottomNav}><SellerNavigation activeView={activeView} onNavigate={setActiveView} /></div>
    </main>
  );
}

function SellerNavigation({ activeView, onNavigate }: { activeView: SellerView; onNavigate: (view: SellerView) => void }) {
  return (
    <nav aria-label="Seller workspace">
      {sellerNavItems.map((item) => {
        const Icon = item.icon;
        return (
          <button className={activeView === item.id ? styles.navActive : ""} type="button" key={item.id} onClick={() => onNavigate(item.id)} aria-current={activeView === item.id ? "page" : undefined}>
            <Icon size={19} /><span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return <header className={styles.pageHeading}><h1>{title}</h1><p>{description}</p></header>;
}

function SellerHome({ dashboard, firstName, onNavigate }: {
  dashboard: SellerDashboardData;
  firstName: string;
  onNavigate: (view: SellerView) => void;
}) {
  return (
    <div className={styles.viewStack}>
      <PageHeading title={`Hello, ${firstName}`} description="Your next action and today's key numbers." />
      <section className={styles.accountReady}>
        <span><BadgeCheck size={22} /></span>
        <div><small>Seller account active</small><strong>Your personal catalog link is ready</strong><p>Use only platform checkout links. Customers pay Direct Loop directly.</p></div>
        <button type="button" onClick={() => onNavigate("share")}>Start sharing <ArrowRight size={17} /></button>
      </section>
      <section className={styles.nextAction}>
        <div>
          <small>Next action</small>
          <h2>Share fresh products with your customers</h2>
          <p>Open your seller catalog, choose a product and send its card on WhatsApp.</p>
          <button type="button" onClick={() => onNavigate("share")}><Share2 size={18} /> Go to sharing</button>
        </div>
        <div className={styles.nextActionStats}>
          <span><Eye size={18} /><small>Link visits</small><strong>{dashboard.metrics.referralVisits}</strong></span>
          <span><MessageCircle size={18} /><small>Contacts</small><strong>{dashboard.metrics.contactClicks}</strong></span>
          <span><CircleDollarSign size={18} /><small>Available</small><strong>{formatKsh(dashboard.metrics.availableCommission)}</strong></span>
        </div>
      </section>
      <section className={styles.workflowPanel}>
        <SectionTitle label="Your routine" title="One sale, three clear steps" />
        <div className={styles.workflowList}>
          <button type="button" onClick={() => onNavigate("share")}><span>1</span><ShoppingBag size={20} /><p><strong>Choose and share</strong><small>Send product cards or your full catalog.</small></p><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onNavigate("share")}><span>2</span><ClipboardList size={20} /><p><strong>Customer pays online</strong><small>The customer checks out through Direct Loop.</small></p><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onNavigate("rewards")}><span>3</span><PackageCheck size={20} /><p><strong>Track commission</strong><small>Paid attributed orders create commission records.</small></p><ChevronRight size={18} /></button>
        </div>
      </section>
    </div>
  );
}

function SellerShare({ dashboard, copied, maxDaily, onCopy, onShare }: {
  dashboard: SellerDashboardData;
  copied: boolean;
  maxDaily: number;
  onCopy: () => Promise<void>;
  onShare: () => Promise<void>;
}) {
  return (
    <div className={styles.viewStack}>
      <PageHeading title="Share products" description="Choose items, share your link and follow customer interest." />
      <section className={styles.shareHero}>
        <div className={styles.linkIcon}><Link2 size={23} /></div>
        <div className={styles.linkCopy}><strong>Your Seller link</strong><span>{dashboard.shareUrl}</span><small>Visits through this link are connected to your Seller account.</small></div>
        <div className={styles.shareHeroActions}>
          <a href={dashboard.shareUrl} target="_blank" rel="noreferrer"><ShoppingBag size={17} /> Choose products</a>
          <button type="button" onClick={() => void onShare()}><Share2 size={17} /> Share Catalog</button>
          <button type="button" onClick={() => void onCopy()}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Copied" : "Copy link"}</button>
        </div>
      </section>
      <section className={styles.shareMetrics}>
        <DashboardMetric icon={<Share2 size={21} />} label="Share actions" value={dashboard.metrics.shareActions.toLocaleString("en-KE")} detail="Tracked source visits" />
        <DashboardMetric icon={<Eye size={21} />} label="Link visits" value={dashboard.metrics.referralVisits.toLocaleString("en-KE")} detail="Referral sessions" />
        <DashboardMetric icon={<MessageCircle size={21} />} label="Customer contacts" value={dashboard.metrics.contactClicks.toLocaleString("en-KE")} detail="WhatsApp source visits" />
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span>Performance</span><h2>Visits in the last 7 days</h2></div><strong>{dashboard.metrics.referralVisits.toLocaleString("en-KE")} all time</strong></div>
        <div className={styles.chart} aria-label="Seven day referral visit chart">
          {dashboard.dailyActivity.map((day) => <div className={styles.chartDay} key={day.date}><span>{day.referralVisits || ""}</span><div><i style={{ height: `${Math.max(4, (day.referralVisits / maxDaily) * 100)}%` }} /></div><small>{formatDate(day.date)}</small></div>)}
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span>Catalog activity</span><h2>Your top products</h2></div></div>
        {dashboard.topProducts.length ? (
          <div className={styles.topProducts}>
            {dashboard.topProducts.map((product) => (
              <Link href={`/p/${encodeURIComponent(product.productCode)}?ref=${encodeURIComponent(dashboard.seller.refCode)}`} key={product.productCode}>
                <img src={product.image} alt="" />
                <span><strong>{product.title}</strong><small>{product.productCode}</small></span>
                <p><strong>{product.referralVisits}</strong><small>visits</small></p>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        ) : <EmptyState text="Share your Seller Catalog to start collecting product activity." />}
      </section>
    </div>
  );
}

function SellerSales({ orders }: { orders: SellerOrder[] }) {
  const activeOrders = orders.filter((order) => order.status === "Paid" || order.status === "Pending").length;
  const completedOrders = orders.filter((order) => order.status === "Completed").length;

  return (
    <div className={styles.viewStack}>
      <PageHeading title="Attributed orders" description="Orders are created by customers through Direct Loop checkout. Sellers do not manually submit or collect order payments." />

      <section className={styles.orderStats}>
        <div><small>Active orders</small><strong>{activeOrders}</strong><p>Paid or processing</p></div>
        <div><small>Completed</small><strong>{completedOrders}</strong><p>Fulfilled orders</p></div>
        <div><small>Attributed all time</small><strong>{orders.length}</strong><p>Orders with your Affiliate ID</p></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span>Order history</span><h2>Your latest attributed orders</h2></div></div>
        {orders.length ? <div className={styles.sellerOrderList}>{orders.map((order) => <SellerOrderRow key={order.orderReference} order={order} />)}</div> : <EmptyState text="Paid orders from your shared links will appear here." />}
      </section>
    </div>
  );
}

function SellerOrderRow({ order }: { order: SellerOrder }) {
  return (
    <article className={styles.sellerOrderRow}>
      <header>
        <div><code>{order.orderReference}</code><time>{formatDate(order.reportedAt)}</time></div>
        <span className={order.status === "Completed" ? styles.orderStatusPickedUp : order.status === "Paid" ? styles.orderStatusConfirmed : styles.orderStatusReported}>
          {order.status === "Completed" ? <PackageCheck size={14} /> : order.status === "Cancelled" || order.status === "Expired" || order.status === "Refunded" ? <XCircle size={14} /> : <BadgeCheck size={14} />}
          {order.status}
        </span>
      </header>
      <div className={styles.sellerOrderCustomer}><p><small>Customer</small><strong>{order.customerName}</strong></p><span>{order.customerPhone || "-"}</span></div>
      <div className={styles.sellerOrderItems}>
        {order.items.map((item) => <div key={`${order.orderReference}-${item.productCode}`}><img src={item.image} alt="" /><p><strong>{item.title}</strong><small>{item.productCode}</small></p><span>{formatKsh(item.price)}</span></div>)}
      </div>
      <footer>
        <p><small>Order subtotal</small><strong>{formatKsh(order.saleAmount)}</strong></p>
        <p><small>Your commission</small><strong>{formatKsh(order.commissionAmount)}</strong></p>
        <em>Payment and fulfillment are handled by Direct Loop.</em>
      </footer>
    </article>
  );
}

function SellerRewards({ dashboard }: { dashboard: SellerDashboardData }) {
  return (
    <div className={styles.viewStack}>
      <PageHeading title="Rewards" description="See verified commission, payout status and reward history." />
      <section className={styles.rewardHero}>
        <div><small>Available for payout</small><strong>{formatKsh(dashboard.metrics.availableCommission)}</strong><p>Rewards become available after Direct Loop verifies a real sale.</p></div>
        <Gift size={38} />
      </section>
      <section className={styles.rewardBalances}>
        <div><i className={styles.pendingDot} /><span><small>Pending review</small><strong>{formatKsh(dashboard.metrics.pendingCommission)}</strong></span></div>
        <div><i className={styles.availableDot} /><span><small>Available</small><strong>{formatKsh(dashboard.metrics.availableCommission)}</strong></span></div>
        <div><i className={styles.paidDot} /><span><small>Paid</small><strong>{formatKsh(dashboard.metrics.paidCommission)}</strong></span></div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span>Reward history</span><h2>Commission entries</h2></div><strong>{dashboard.rewards.length} records</strong></div>
        {dashboard.rewards.length ? (
          <div className={styles.rewardList}>
            {dashboard.rewards.map((reward) => (
              <article key={reward.id}>
                <div className={styles.rewardIcon}><CircleDollarSign size={19} /></div>
                <span><strong>{reward.orderReference}</strong><small>{formatDate(reward.earnedAt)}{reward.note ? ` - ${reward.note}` : ""}</small></span>
                <p><strong>{formatKsh(reward.commissionAmount)}</strong><small>{formatKsh(reward.saleAmount)} sale</small></p>
                <em className={rewardClass(reward.status)}>{rewardLabels[reward.status]}</em>
              </article>
            ))}
          </div>
        ) : <EmptyState text="Verified sales and commission rewards will appear here." />}
      </section>
      <p className={styles.rewardNote}>Commission is recorded only after a paid attributed order. Delivery or pickup costs are not included.</p>
    </div>
  );
}

function SectionTitle({ label, title }: { label: string; title: string }) {
  return <div className={styles.sectionTitle}><div><small>{label}</small><h2>{title}</h2></div></div>;
}

function DashboardMetric({ icon, label, value, detail }: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className={styles.metricCard}>
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.emptyState}><BarChart3 size={24} /><p>{text}</p></div>;
}

function formatKsh(value: number) {
  return `KSh ${value.toLocaleString("en-KE")}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", { day: "2-digit", month: "short" }).format(date);
}

function rewardClass(status: SellerRewardStatus) {
  if (status === "Paid") return styles.rewardPaid;
  if (status === "Available") return styles.rewardApproved;
  if (status === "Rejected") return styles.rewardPending;
  return styles.rewardPending;
}

function supportWhatsappUrl() {
  return "https://wa.me/254742001507?text=Hello%20Direct%20Loop%2C%20I%20want%20to%20apply%20for%20seller%20access.";
}
